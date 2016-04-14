/**
 * Persistence manager
 *
 * TODO: Investigate first tab processes ALL sync requests; needs to NOT load sync events from tab thats already loaded; in fact, already loaded tab could snag all sync events from table.; Can a very simple service-worker be used to manage open tabs and which one gets which sync events?
 * TODO: If I have 5 tabs open, send a bunch of stuff offline, and then never again open 5, someone should still find those events and send them.
 * TODO: If I read sync_state=NEW items, ignore them unless from our `clientId`
 * @class layer.db-manager
 */

const DB_VERSION = 2;
const Root = require('./root');
const logger = require('./logger');
const SyncEvent = require('./sync-event');
const Constants = require('./const');
const Util = require('./client-utils');

function getDate(inDate) {
  return inDate ? inDate.toISOString() : null;
}

class DbManager extends Root {
  constructor(options) {
    super(options);

    // If Client is a layer.ClientAuthenticator, it won't support these events
    // TODO: Redesign this as a more abstract DBManager class that has no concept of Conversations, Messages or SyncEvents.
    if (this.client.constructor._supportedEvents.indexOf('conversations:add') !== -1) {
      this.client.on('conversations:add', evt => this.writeConversations(evt.conversations, false));
      this.client.on('conversations:change', evt => this.writeConversations([evt.target], true));
      this.client.on('conversations:delete', evt => this.deleteObjects('conversations', [evt.target]));

      this.client.on('messages:add', evt => this.writeMessages(evt.messages, false));
      this.client.on('messages:change', evt => this.writeMessages([evt.target], true));
      this.client.on('messages:delete', evt => this.deleteObjects('messages', [evt.target]));
    }

    this.client.syncManager.on('sync:add sync:abort sync:error', evt => this.writeSyncEvents([evt.request], false));

    if (!window.indexedDB) this.isDisabled = true;
    this._open();
  }


  _open() {
    if (this.isDisabled) return;
    const request = window.indexedDB.open('LayerWebSDK_' + this.client.appId + '_' + this.client.userId, DB_VERSION);
    request.onupgradeneeded = (evt) => this._onUpgradeNeeded(evt);
    request.onsuccess = (evt) => {
      this.db = evt.target.result;
      this.isOpen = true;
      this.trigger('open');

      this.db.onversionchange = () => {
        this.db.close();
        this.isOpen = false;
      };

      this.db.error = err => {
        logger.error('db-manager Error: ', err);
      };
    };
  }

  onOpen(callback) {
    if (this.isDisabled) return;
    if (this.isOpen) callback();
    else this.once('open', callback);
  }

  /* istanbul ignore next */
  _onUpgradeNeeded(event) {
    const db = event.target.result;
    try {
      db.deleteObjectStore('conversations');
      db.deleteObjectStore('identities');
      db.deleteObjectStore('messages');
      db.deleteObjectStore('sync-queue');
    } catch (e) {
      // Noop
    }
    const stores = [
      db.createObjectStore('conversations', { keyPath: 'id' }),
      db.createObjectStore('messages', { keyPath: 'id' }),
      db.createObjectStore('identities', { keyPath: 'id' }),
      db.createObjectStore('sync-queue', { keyPath: 'id' }),
    ];

    stores[1].createIndex('conversation', 'conversation', { unique: false });
    stores[3].createIndex('client_id', 'client_id', { unique: false });

    let completeCount = 0;
    function onComplete() {
      completeCount++;
      if (completeCount === stores.length) {
        this.isOpen = true;
        this.trigger('open');
      }
    }

    stores.forEach(store => (store.transaction.oncomplete = onComplete));
  }

  _isRelevantEntry(entry) {
    if ('sync_state' in entry) {
      return entry.sync_state !== 'NEW' && entry.sync_state !== 'SAVING' || entry.client_id === this.client.id;
    }
    return true;
  }

  _getConversationData(conversations) {
    return conversations.filter(conversation => {
      if (conversation._fromDB) {
        conversation._fromDB = false;
        return false;
      } else if (conversation.isLoading) {
        return false;
      } else {
        return true;
      }
    }).map(conversation => {
      const item = {
        id: conversation.id,
        url: conversation.url,
        participants: conversation.participants,
        distinct: conversation.distinct,
        created_at: getDate(conversation.createdAt),
        metadata: conversation.metadata,
        unread_message_count: conversation.unreadCount,
        last_message: conversation.lastMessage ? conversation.lastMessage.id : '',
        sync_state: conversation.syncState,
        client_id: !conversation.isSaved() ? this.client.id : '',
      };
      return item;
    });
  }

  writeConversations(conversations, isUpdate, callback) {
    this._writeObjects('conversations', this._getConversationData(conversations), isUpdate, callback);
  }

  _getMessageData(messages) {
    return messages.filter(message => {
      if (message._fromDB) {
        message._fromDB = false;
        return false;
      } else if (message.syncState === Constants.SYNC_STATE.LOADING) {
        return false;
      } else {
        return true;
      }
    }).map(message => {
      const item = {
        id: message.id,
        url: message.url,
        parts: message.parts.map(part => {
          return {
            id: part.id,
            body: part.body,
            encoding: part.encoding,
            mime_type: part.mimeType,
            content: !part._content ? null : {
              id: part._content.id,
              download_url: part._content.downloadUrl,
              expiration: part._content.expiration,
              refresh_url: part._content.refreshUrl,
              size: part._content.size,
            },
          };
        }),
        position: message.position,
        sender: {
          name: message.sender.name,
          user_id: message.sender.userId,
        },
        recipient_status: message.recipientStatus,
        sent_at: getDate(message.sentAt),
        received_at: getDate(message.receivedAt),
        conversation: message.conversationId,
        sync_state: message.syncState,
        client_id: !message.isSaved() ? this.client.id : '',
      };
      return item;
    });
  }

  writeMessages(messages, isUpdate, callback) {
    this._writeObjects('messages', this._getMessageData(messages), isUpdate, callback);
  }

  _getSyncEventData(syncEvents) {
    return syncEvents.filter(syncEvt => {
      if (syncEvt.fromDB) {
        syncEvt.fromDB = false;
        return false;
      } else {
        return true;
      }
    }).map(syncEvent => {
      const item = {
        id: syncEvent.id,
        client_id: this.client.id,
        target: syncEvent.target,
        depends: syncEvent.depends,
        isWebsocket: syncEvent instanceof SyncEvent.WebsocketSyncEvent,
        operation: syncEvent.operation,
        data: syncEvent.data,
        url: syncEvent.url || '',
        headers: syncEvent.headers || null,
        method: syncEvent.method || null,
        created_at: syncEvent.createdAt,
      };
      return item;
    });
  }

  writeSyncEvents(syncEvents, isUpdate, callback) {
    this._writeObjects('sync-queue', this._getSyncEventData(syncEvents), isUpdate, callback);
  }

  // TODO: Count the number of transactions, and the number of transaction.oncomplete calls and only then call the callback
  _writeObjects(tableName, data, isUpdate, callback) {
    if (!data.length) {
      if (callback) callback();
      return;
    }

    let transactionCount = 1,
      transactionCompleteCount = 0;
    function transactionComplete() {
      transactionCompleteCount++;
      if (transactionCompleteCount === transactionCount && callback) callback();
    }

    this.onOpen(() => {
      const transaction = this.db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      transaction.oncomplete = transaction.onerror = transactionComplete;

      data.forEach(item => {
        const req = isUpdate ? store.put(item) : store.add(item);
        req.onerror = () => {
          if (!isUpdate) {
            transactionCount++;
            const transaction2 = this.db.transaction([tableName], 'readwrite');
            const store2 = transaction2.objectStore(tableName);
            transaction2.oncomplete = transaction2.onerror = transactionComplete;
            store2.put(item);
          }
        };
      });
    });
  }

  loadConversations(callback) {
    this._loadAll('conversations', data => {
      const messagesToLoad = data
        .map(item => item.last_message)
        .filter(messageId => !this.client.getMessage(messageId));
      this.getObjects('messages', messagesToLoad, messages => {
        this._loadConversationsResult(data, messages, callback);
      });
    });
  }

  _loadConversationsResult(conversations, messages, callback) {
    messages.forEach(message => this._createMessage(message));
    const newData = conversations
      .map(conversation => this._createConversation(conversation))
      .filter(conversation => conversation);
    if (callback) callback(newData);
  }

  loadMessages(conversationId, callback) {
    this._loadByIndex('messages', 'conversation', conversationId, data => {
      this._loadMessagesResult(data, callback);
    });
  }

  _loadMessagesResult(messages, callback) {
    const newData = messages
      .map(message => this._createMessage(message))
      .filter(message => message);
    if (callback) callback(newData);
  }

  _createConversation(conversation) {
    if (!this.client.getConversation(conversation.id)) {
      conversation._fromDB = true;
      const lastMessage = conversation.last_message;
      conversation.last_message = '';
      const result = this.client._createObject(conversation);
      result.conversation.syncState = conversation.sync_state;
      result.conversation.lastMessage = this.client.getMessage(lastMessage) || null;
      return result.conversation;
    }
  }

  _createMessage(message) {
    if (!this.client.getMessage(message.id)) {
      message._fromDB = true;
      message.conversation = { id: message.conversation };
      const result = this.client._createObject(message);
      result.message.syncState = message.sync_state;
      return result.message;
    }
  }

  loadSyncQueue(callback) {
    this._loadByIndex('sync-queue', 'client_id', this.client.id, syncEvents => {
      this._loadSyncEventRelatedData(syncEvents, callback);
    });
  }

  _loadSyncEventRelatedData(syncEvents, callback) {
    const messageIds = syncEvents
      .filter(item => item.target && item.target.match(/messages/)).map(item => item.target);
    const conversationIds = syncEvents
      .filter(item => item.target && item.target.match(/conversations/)).map(item => item.target);

    // Load any Messages/Conversations that are targets of operations.
    // They may already be loaded, but we need to make sure.
    this.getObjects('messages', messageIds, messages => {
      messages.forEach(message => this._createMessage(message));
      this.getObjects('conversations', conversationIds, conversations => {
        conversations.forEach(conversation => this._createConversation(conversation));
        this._loadSyncEventResults(syncEvents, callback);
      });
    });
  }

  _loadSyncEventResults(syncEvents, callback) {
    const newData = syncEvents
    // If the target is present in the sync event, but does not exist in the system,
    // do NOT attempt to instantiate this event.
    .filter(syncEvent => !syncEvent.target || this.client._getObject(syncEvent.target))
    .map(syncEvent => {
      if (syncEvent.isWebsocket) {
        return new SyncEvent.WebsocketSyncEvent({
          target: syncEvent.target,
          depends: syncEvent.depends,
          operation: syncEvent.operation,
          id: syncEvent.id,
          data: syncEvent.data,
          fromDB: true,
          createdAt: syncEvent.created_at,
        });
      } else {
        return new SyncEvent.XHRSyncEvent({
          target: syncEvent.target,
          depends: syncEvent.depends,
          operation: syncEvent.operation,
          id: syncEvent.id,
          data: syncEvent.data,
          method: syncEvent.method,
          headers: syncEvent.headers,
          url: syncEvent.url,
          fromDB: true,
          createdAt: syncEvent.created_at,
        });
      }
    });
    Util.sortBy(newData, item => item.createdAt);
    callback(newData);
  }

  _loadAll(tableName, callback) {
    if (this.isDisabled) return callback([]);
    this.onOpen(() => {
      const data = [];
      this.db.transaction([tableName], 'readonly').objectStore(tableName).openCursor().onsuccess = (evt) => {
        const cursor = evt.target.result;
        if (cursor) {
          data.push(cursor.value);
          cursor.continue();
        } else {
          callback(data.filter(item => this._isRelevantEntry(item)));
        }
      };
    });
  }

  _loadByIndex(tableName, indexName, indexValue, callback) {
    if (this.isDisabled) return callback([]);
    this.onOpen(() => {
      const data = [];
      const range = window.IDBKeyRange.only(indexValue);
      this.db.transaction([tableName], 'readonly')
          .objectStore(tableName)
          .index(indexName)
          .openCursor(range)
          .onsuccess = (evt) => {
            const cursor = evt.target.result;
            if (cursor) {
              data.push(cursor.value);
              cursor.continue();
            } else {
              callback(data.filter(item => this._isRelevantEntry(item)));
            }
          };
    });
  }

  deleteObjects(tableName, data, callback) {
    this.onOpen(() => {
      const transaction = this.db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      transaction.oncomplete = callback;
      data.forEach(item => store.delete(item.id));
    });
  }

  // Inspired by http://www.codeproject.com/Articles/744986/How-to-do-some-magic-with-indexedDB
  getObjects(tableName, ids, callback) {
    if (this.isDisabled) return callback([]);
    const data = [];
    const sortedIds = ids.sort();
    for (let i = sortedIds.length - 1; i > 0; i--) {
      if (sortedIds[i] === sortedIds[i - 1]) sortedIds.splice(i, 1);
    }
    let index = 0;
    this.onOpen(() => {
      this.db.transaction([tableName], 'readonly')
        .objectStore(tableName)
        .openCursor().onsuccess = (evt) => {
          const cursor = evt.target.result;
          if (!cursor) {
            callback(data);
            return;
          }
          const key = cursor.key;

          // The cursor has passed beyond this key. Check next.
          while (key > sortedIds[index]) index++;

          // The cursor is pointing at one of our IDs, get it and check next.
          if (key === sortedIds[index]) {
            data.push(cursor.value);
            index++;
          }

          // Done or check next
          if (index === sortedIds.length) {
            callback(data.filter(item => this._isRelevantEntry(item)));
          } else {
            cursor.continue(sortedIds[index]);
          }
        };
    });
  }

  claimSyncEvent(syncEvent, callback) {
    this.onOpen(() => {
      const transaction = this.db.transaction(['sync-queue'], 'readwrite');
      const store = transaction.objectStore('sync-queue');
      store.get(syncEvent.id).onsuccess = evt => callback(Boolean(evt.target.result));
      store.delete(syncEvent.id);
    });
  }

  deleteTables(callback) {
    this.onOpen(() => {
      try {
        const transaction = this.db.transaction(['conversations', 'identities', 'messages', 'sync-queue'], 'readwrite');
        transaction.objectStore('conversations').clear();
        transaction.objectStore('identities').clear();
        transaction.objectStore('messages').clear();
        transaction.objectStore('sync-queue').clear();
        transaction.oncomplete = callback;
      } catch (e) {
        // Noop
      }
    });
  }
}

/**
 * @type {layer.Client}
 */
DbManager.prototype.client = null;

/**
 * @type {boolean} is the db connection open
 */
DbManager.prototype.isOpen = false;

/**
 * @type {boolean} is db storage disabled?
 */
DbManager.prototype.isDisabled = false;

/**
 * @type IDBDatabase
 */
DbManager.prototype.db = null;

DbManager._supportedEvents = [
  'open',
];

Root.initClass.apply(DbManager, [DbManager, 'DbManager']);
module.exports = DbManager;
