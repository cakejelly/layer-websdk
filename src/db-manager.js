/**
 * Persistence manager
 *
 * @class layer.db-manager
 */

const DB_VERSION = 10;
const Root = require('./root');
const logger = require('./logger');

function getDate(inDate) {
  return inDate ? inDate.toISOString() : null;
}

class DbManager extends Root {
  constructor(options) {
    super(options);
    this.client.on('conversations:add', evt => this.writeConversations(evt.conversations, false));
    this.client.on('messages:add', evt => this.writeMessages(evt.messages, false));

    this.client.on('conversations:change', evt => this.writeConversations([evt.target], true));
    this.client.on('messages:change', evt => this.writeMessages([evt.target], true));

    this.client.on('conversations:delete', evt => this.deleteObjects('conversations', [evt.target]));
    this.client.on('messages:delete', evt => this.deleteObjects('messages', [evt.target]));

    //this.client.syncManager.on('sync:add', evt => this.writeSyncEvent([evt.request]));
    //this.client.syncManager.on('sync:error sync:success', evt => this.deleteObjects('sync-queue', [evt.request]));
    this._syncQueueMonitorId = setInterval(() => this.reviewSyncEvents(), 30000);

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

  writeConversations(conversations, isUpdate) {
    const data = conversations.filter(conversation => {
      if (conversation._fromIndexedDB) {
        conversation._fromIndexedDB = false;
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
      };
      return item;
    });

    this._writeObjects(isUpdate, 'conversations', data);
  }

  writeMessages(messages, isUpdate) {
    const data = messages.filter(message => {
      if (message._fromIndexedDB) {
        message._fromIndexedDB = false;
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
      };
      return item;
    });

    this._writeObjects(isUpdate, 'messages', data);
  }

  writeSyncEvent() {

  }

  // TODO: Count the number of transactions, and the number of transaction.oncomplete calls and only then call the callback
  _writeObjects(isUpdate, tableName, data) {
    this.onOpen(() => {
      const transaction = this.db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);

      // data.forEach(item => isUpdate ? store.put(item) : store.add(item));
      data.forEach(item => {
        const req = store.add(item);
        req.onerror = () => {
          this.db.transaction([tableName], 'readwrite').objectStore(tableName).put(item);
        };
      });
    });
  }

  loadConversations(callback) {
    this._loadAll('conversations', data => {
      const newData = [];
      data.forEach(conversation => {
        if (!this.client.getConversation(conversation.id)) {
          conversation._fromIndexedDB = true;
          conversation.last_message = null;
          const result = this.client._createObject(conversation);
          newData.push(result.conversation);
        }
      });
      callback(newData);
    });
  }

  loadMessages(conversationId, callback) {
    this._loadByIndex('messages', 'conversation', conversationId, data => {
      const newData = [];
      data.forEach(message => {
        if (!this.client.getMessage(message.id)) {
          message._fromIndexedDB = true;
          message.conversation = { id: message.conversation };
          const result = this.client._createObject(message);
          newData.push(result.message);
        }
      });
      callback(newData);
    });
  }

  _loadAll(tableName, callback) {
    this.onOpen(() => {
      const data = [];
      this.db.transaction([tableName], 'readonly').objectStore(tableName).openCursor().onsuccess = (evt) => {
        const cursor = evt.target.result;
        if (cursor) {
          data.push(cursor.value);
          cursor.continue();
        } else {
          callback(data);
        }
      };
    });
  }

  _loadByIndex(tableName, indexName, indexValue, callback) {
    this.onOpen(() => {
      const data = [];
      const range = IDBKeyRange.only(indexValue);
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
              callback(data);
            }
          };
    });
  }

  deleteObjects(tableName, data) {
    this.onOpen(() => {
      const transaction = this.db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);

      data.forEach(item => store.delete(item.id));
    });
  }

  // Inspired by http://www.codeproject.com/Articles/744986/How-to-do-some-magic-with-indexedDB
  getObjects(tableName, ids, callback) {
    const results = [];
    const sortedIds = ids.sort();
    let index = 0;
    this.onOpen(() => {
      this.db.transaction([tableName], 'readonly')
        .objectStore(tableName)
        .openCursor().onsuccess = (evt) => {
          const cursor = evt.target.result;
          if (!cursor) {
            callback(results);
            return;
          }
          const key = cursor.key;

          // The cursor has passed beyond this key. Check next.
          while (key > sortedIds[index]) index++;

          // The cursor is pointing at one of our IDs, get it and check next.
          if (key === sortedIds[index]) {
            results.push(cursor.value);
            index++;
          }

          // Done or check next
          if (index === sortedIds.length) {
            callback(results);
          } else {
            cursor.continue(sortedIds[index]);
          }
        };
    });
  }

  reviewSyncEvents() {

  }

  // TODO: For when the user logs out
  logout() {
    this.onOpen(() => {
      try {
        this.db.deleteObjectStore('conversations');
        this.db.deleteObjectStore('identities');
        this.db.deleteObjectStore('messages');
        this.db.deleteObjectStore('sync-event');
        this.db.close();
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
