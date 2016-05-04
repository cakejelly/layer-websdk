/**
 * Persistence manager.
 *
 * This class manages all indexedDB access.  It is not responsible for any localStorage access, though it may
 * receive configurations related to data stored in localStorage.  It will simply ignore those configurations.
 *
 * TODO:
 * 0. Redesign this so that knowledge of the data is not hard-coded in
 * 1. JSDuck this class
 * 2. Update documentation repo
 * @class layer.db-manager
 * @protected
 */

const DB_VERSION = 13;
const Root = require('./root');
const logger = require('./logger');
const SyncEvent = require('./sync-event');
const Constants = require('./const');
const Util = require('./client-utils');

function getDate(inDate) {
  return inDate ? inDate.toISOString() : null;
}

const TABLES = ['conversations', 'messages', 'identities', 'syncQueue'];

class DbManager extends Root {

  /**
   * Create the DB Manager
   *
   * Key configuration is the layer.DbManager.persistenceFeatures property.
   *
   * @param {Object} options
   * @param {layer.Client} options.client
   * @param {Object} options.persistenceFeatures
   * @return {layer.DbManager} this
   */
  constructor(options) {
    super(options);

    // If no indexedDB, treat everything as disabled.
    if (!window.indexedDB) {
      this.tables = DbManager.DisabledState;
    }

    // If Client is a layer.ClientAuthenticator, it won't support these events; this affects Unit Tests
    else if (this.client.constructor._supportedEvents.indexOf('conversations:add') !== -1) {
      this.client.on('conversations:add', evt => this.writeConversations(evt.conversations, false));
      this.client.on('conversations:change', evt => this.writeConversations([evt.target], true));
      this.client.on('conversations:delete', evt => this.deleteObjects('conversations', [evt.target]));

      this.client.on('messages:add', evt => this.writeMessages(evt.messages, false));
      this.client.on('messages:change', evt => this.writeMessages([evt.target], true));
      this.client.on('messages:delete', evt => this.deleteObjects('messages', [evt.target]));
    }

    this.client.syncManager.on('sync:add', evt => this.writeSyncEvents([evt.request], false));
    this.client.syncManager.on('sync:abort sync:error', evt => this.deleteObjects('syncQueue', [evt.request]));



    // Sync Queue only really works properly if we have the Messages and Conversations written to the DB; turn it off
    // if that won't be the case.
    if (!this.tables.conversations || !this.tables.messages) {
      this.tables.syncQueue = false;
    }
    this._open();
  }


  /**
   * Open the Database Connection.
   *
   * This is only called by the constructor.
   * @method _open
   * @private
   */
  _open() {
    // Abort if all tables are disabled
    if (Object.keys(this.tables).filter(key => this.tables[key]).length === 0) return;

    // Open the database
    const request = window.indexedDB.open('LayerWebSDK_' + this.client.appId + '_' + this.client.userId, DB_VERSION);

    request.onerror = (evt) => {
      console.error('Database Unable to Open: ', evt.target.error);
      this.tables = DbManager.DisabledState;
    }
    request.onupgradeneeded = (evt) => this._onUpgradeNeeded(evt);
    request.onsuccess = (evt) => {
      console.log("DB IS NOW OPEN");
      this.db = evt.target.result;
      console.dir(this.db);
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

  /**
   * Use this to setup a call to happen as soon as the database is open.
   *
   * Typically, this call will immediately, synchronously call your callback.
   * But if the DB is not open yet, your callback will be called once its open.
   * @method onOpen
   * @param {Function} callback
   */
  onOpen(callback) {
    if (this.isOpen) callback();
    else this.once('open', callback);
  }

  /**
   * The onUpgradeNeeded function is called by IndexedDB any time DB_VERSION is incremented.
   *
   * This invocation is part of the built-in lifecycle of IndexedDB.
   *
   * @method _onUpgradeNeeded
   * @param {IDBVersionChangeEvent} event
   * @private
   */
  /* istanbul ignore next */
  _onUpgradeNeeded(event) {
    const db = event.target.result;

    let completeCount = 0;
    function onComplete() {
      completeCount++;
      if (completeCount === TABLES.length) {
        this.isOpen = true;
        this.trigger('open');
      }
    }

    TABLES.forEach((tableName) => {
      try {
        db.deleteObjectStore(tableName);
        const store = db.createObjectStore(tableName, { keyPath: 'id' });
        if (tableName === 'messages') {
          store.createIndex('conversation', 'conversation', { unique: false });
        }
        store.transaction.oncomplete = onComplete;
      } catch (e) {
        // Noop
      }
    });
  }

  /**
   * Convert array of Conversation instances into Conversation DB Entries.
   *
   * A Conversation DB entry looks a lot like the server representation, but
   * includes a sync_state property, and `last_message` contains a message ID not
   * a Message object.
   *
   * @method _getConversationData
   * @private
   * @param {layer.Conversation[]} conversations
   * @return {Object[]} conversations
   */
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
      };
      return item;
    });
  }

  /**
   * Writes an array of Conversations to the Database.
   *
   * There are times when you will not know if this is an Insert or Update operation;
   * if there is uncertainy, set `isUpdate` to false, and the correct end result will
   * still be achieved (but less efficiently).
   *
   * @method writeConversations
   * @param {layer.Conversation[]} conversations - Array of Conversations to write
   * @param {boolean} isUpdate - If true, then update an entry; if false, insert an entry... and if one is found to already exist, update it.
   * @param {Function} [callback]
   */
  writeConversations(conversations, isUpdate, callback) {
    this._writeObjects('conversations',
      this._getConversationData(conversations.filter(conversation => !conversation.isDestroyed)), isUpdate, callback);
  }

  /**
   * Convert array of Message instances into Message DB Entries.
   *
   * A Message DB entry looks a lot like the server representation, but
   * includes a sync_state property.
   *
   * @method _getMessageData
   * @private
   * @param {layer.Message[]} messages
   * @return {Object[]} messages
   */
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
    }).map(message => ({
      id: message.id,
      url: message.url,
      parts: message.parts.map(part => ({
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
      })),
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
    }));
  }

  /**
   * Writes an array of Messages to the Database.
   *
   * There are times when you will not know if this is an Insert or Update operation;
   * if there is uncertainy, set `isUpdate` to false, and the correct end result will
   * still be achieved (but less efficiently).
   *
   * @method writeMessages
   * @param {layer.Message[]} messages - Array of Messages to write
   * @param {boolean} isUpdate - If true, then update an entry; if false, insert an entry... and if one is found to already exist, update it.
   * @param {Function} [callback]
   */
  writeMessages(messages, isUpdate, callback) {
    this._writeObjects('messages', this._getMessageData(messages.filter(message => !message.isDestroyed)),
      isUpdate, callback);
  }

  /**
   * Convert array of SyncEvent instances into SyncEvent DB Entries.
   *
   * @method _getSyncEventData
   * @param {layer.SyncEvent[]} syncEvents
   * @return {Object[]} syncEvents
   * @private
   */
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

  /**
   * Writes an array of SyncEvent to the Database.
   *
   * @method writeSyncEvents
   * @param {layer.SyncEvent[]} syncEvents - Array of Sync Events to write
   * @param {boolean} isUpdate - If true, then update an entry; if false, insert an entry... and if one is found to already exist, update it.
   * @param {Function} [callback]
   */
  writeSyncEvents(syncEvents, isUpdate, callback) {
    this._writeObjects('syncQueue', this._getSyncEventData(syncEvents), isUpdate, callback);
  }

  /**
   * Write an array of data to the specified Database table.
   *
   * @method _writeObjects
   * @param {string} tableName - The name of the table to write to
   * @param {Object[]} data - Array of POJO data to write
   * @param {Boolean} isUpdate - If true, then update an entry; if false, insert an entry... and if one is found to already exist, update it.
   * @param {Function} [callback] - Called when all data is written
   * @protected
   */
  _writeObjects(tableName, data, isUpdate, callback) {

    // Just quit if no data to write
    if (!data.length) {
      if (callback) callback();
      return;
    }

    // transactionComplete will call the callback after all writes are done.
    // Note that the number of transactions is 1 + number of failed inserts
    let transactionCount = 1,
      transactionCompleteCount = 0;
    function transactionComplete() {
      transactionCompleteCount++;
      if (transactionCompleteCount === transactionCount && callback) callback();
    }

    // PUT (udpate) or ADD (insert) each item of data one at a time, but all as part of one large transaction.
    this.onOpen(() => {
      const transaction = this.db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      transaction.oncomplete = transaction.onerror = transactionComplete;

      data.forEach(item => {
        const req = isUpdate ? store.put(item) : store.add(item);

        // If the request fails, and we were doing an insert, try an update instead.
        // This will create one transaction per error.
        // TODO: Investigate capturing all errors and then using a single transaction to update all failed items.
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

  /**
   * Load all conversations from the database.
   *
   * @method loadConversations
   * @param {Function} callback
   * @param {layer.Conversation[]} callback.result
   */
  loadConversations(callback) {
    // Step 1: Get all Conversations
    this._loadAll('conversations', (data) => {
      // Step 2: Gather all Message IDs needed to initialize these Conversation's lastMessage properties.
      const messagesToLoad = data
        .map(item => item.last_message)
        .filter(messageId => messageId && !this.client.getMessage(messageId));

      // Step 3: Load all Messages needed to initialize these Conversation's lastMessage properties.
      this.getObjects('messages', messagesToLoad, (messages) => {
        this._loadConversationsResult(data, messages, callback);
      });
    });
  }

  /**
   * Assemble all LastMessages and Conversation POJOs into layer.Message and layer.Conversation instances.
   *
   * @method _loadConversationsResult
   * @private
   * @param {Object[]} conversations
   * @param {Object[]} messages
   * @param {Function} callback
   * @param {layer.Conversation[]} callback.result
   */
  _loadConversationsResult(conversations, messages, callback) {
    // Instantiate and Register each Message
    messages.forEach(message => this._createMessage(message));

    // Instantiate and Register each Conversation; will find any lastMessage that was registered.
    conversations.forEach(conversation => this._createConversation(conversation));
    const newData = conversations
      .map(conversation => this.client.getConversation(conversation.id))
      .filter(conversation => conversation);

    // Return the data
    if (callback) callback(newData);
  }

  /**
   * Load all messages for a given Conversation ID from the database.
   *
   * Use _loadAll if loading All Messages rather than all Messages for a Conversation.
   *
   * @method loadMessages
   * @param {string} conversationId - ID of the Conversation whose Messages are of interest.
   * @param {Function} callback
   * @param {layer.Message[]} callback.result
   */
  loadMessages(conversationId, callback) {
    this._loadByIndex('messages', 'conversation', conversationId, (data) => {
      this._loadMessagesResult(data, callback);
    });
  }

  /**
   * Registers and sorts the message objects from the database.
   *
   * TODO: Encode limits on this, else we are sorting tens of thousands
   * of messages in javascript.
   *
   * @method _loadMessagesResult
   * @private
   * @param {Object[]} Message objects from the database.
   * @param {Function} callback
   * @param {layer.Message} callback.result - Message instances created from the database
   */
  _loadMessagesResult(messages, callback) {
    // Instantiate and Register each Message
    messages.forEach(message => this._createMessage(message));

    // Retrieve all Messages registered or preregistered in this way
    const newData = messages
      .map(message => this.client.getMessage(message.id))
      .filter(message => message);

    // Sort the results by position
    Util.sortBy(newData, item => item.position);

    // Return the results
    if (callback) callback(newData);
  }


  /**
   * Instantiate and Register the Conversation from a conversation DB Entry.
   *
   * If the layer.Conversation already exists, then its presumed that whatever is in
   * javascript cache is more up to date than whats in IndexedDB cache.
   *
   * Attempts to assign the lastMessage property to refer to appropriate Message.  If it fails,
   * it will be set to null.
   *
   * @method _createConversation
   * @param {Object} conversation
   * @returns {layer.Conversation}
   */
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

  /**
   * Instantiate and Register the Message from a message DB Entry.
   *
   * If the layer.Message already exists, then its presumed that whatever is in
   * javascript cache is more up to date than whats in IndexedDB cache.
   *
   * @method _createMessage
   * @param {Object} message
   * @returns {layer.Message}
   */
  _createMessage(message) {
    if (!this.client.getMessage(message.id)) {
      message._fromDB = true;
      message.conversation = { id: message.conversation };
      const result = this.client._createObject(message);
      result.message.syncState = message.sync_state;
      return result.message;
    }
  }

  /**
   * Load all Sync Events from the database.
   *
   * @method loadSyncQueue
   * @param {Function} callback
   * @param {layer.SyncEvent[]} callback.result
   */
  loadSyncQueue(callback) {
    this._loadAll('syncQueue', syncEvents => this._loadSyncEventRelatedData(syncEvents, callback));
  }

  /**
   * Validate that we have appropriate data for each SyncEvent and instantiate it.
   *
   * Any operation that is not a DELETE must have a valid target found in the database or javascript cache,
   * otherwise it can not be executed.
   *
   * TODO: Need to cleanup sync entries that have invalid targets
   *
   * @method _loadSyncEventRelatedData
   * @private
   * @param {Object[]} syncEvents
   * @param {layer.SyncEvent[]} callback.result
   */
  _loadSyncEventRelatedData(syncEvents, callback) {
    // Gather all Message IDs that are targets of operations.
    const messageIds = syncEvents
      .filter(item => item.operation !== 'DELETE' && item.target && item.target.match(/messages/))
      .map(item => item.target);

    // Gather all Conversation IDs that are targets of operations.
    const conversationIds = syncEvents
      .filter(item => item.operation !== 'DELETE' && item.target && item.target.match(/conversations/))
      .map(item => item.target);

    // Load any Messages/Conversations that are targets of operations.
    // Call _createMessage or _createConversation on all targets found.
    this.getObjects('messages', messageIds, (messages) => {
      messages.forEach(message => this._createMessage(message));
      this.getObjects('conversations', conversationIds, (conversations) => {
        conversations.forEach(conversation => this._createConversation(conversation));
        this._loadSyncEventResults(syncEvents, callback);
      });
    });
  }

  /**
   * Turn an array of Sync Event DB Entries into an array of layer.SyncEvent.
   *
   * @method _loadSyncEventResults
   * @private
   * @param {Object[]} syncEvents
   * @param {layer.SyncEvent[]} callback.result
   */
  _loadSyncEventResults(syncEvents, callback) {

    // If the target is present in the sync event, but does not exist in the system,
    // do NOT attempt to instantiate this event... unless its a DELETE operation.
    const newData = syncEvents
    .filter(syncEvent => !syncEvent.target || syncEvent.operation === 'DELETE' || this.client._getObject(syncEvent.target))
    .map((syncEvent) => {
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

    // Sort the results and then return them.
    Util.sortBy(newData, item => item.createdAt);
    callback(newData);
  }

  /**
   * Load all data from the specified table.
   *
   * @method _loadAll
   * @protected
   * @param {String} tableName
   * @param {Function} callback
   * @param {Object[]} callback.result
   */
  _loadAll(tableName, callback) {
    if (!this.tables[tableName]) return callback([]);
    this.onOpen(() => {
      const data = [];
      this.db.transaction([tableName], 'readonly').objectStore(tableName).openCursor().onsuccess = (evt) => {
        const cursor = evt.target.result;
        if (cursor) {
          data.push(cursor.value);
          cursor.continue();
        } else {
          if (!this.isDestroyed) callback(data);
        }
      };
    });
  }

  /**
   * Load all data from the specified table and with the specified index value.
   *
   * @method _loadByIndex
   * @protected
   * @param {String} tableName
   * @param {String} indexName
   * @param {String} indexValue
   * @param {Function} callback
   * @param {Object[]} callback.result
   */
  _loadByIndex(tableName, indexName, indexValue, callback) {
    if (!this.tables[tableName]) return callback([]);
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
              if (!this.isDestroyed) callback(data);
            }
          };
    });
  }

  /**
   * Deletes the specified objects from the specified table.
   *
   * Currently takes an array of data to delete rather than an array of IDs;
   * If you only have an ID, [{id: myId}] should work.
   *
   * @method deleteObjects
   * @param {String} tableName
   * @param {Object[]} data
   * @param {Function} [callback]
   */
  deleteObjects(tableName, data, callback) {
    if (!this.tables[tableName]) return callback ? callback() : null;
    this.onOpen(() => {
      const transaction = this.db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      transaction.oncomplete = callback;
      data.forEach(item => store.delete(item.id));
    });
  }

  /**
   * Retrieve the identified objects from the specified database table.
   *
   * Turning these into instances is the responsibility of the caller.
   *
   * Inspired by http://www.codeproject.com/Articles/744986/How-to-do-some-magic-with-indexedDB
   *
   * @method getObjects
   * @param {String} tableName
   * @param {String[]} ids
   * @param {Function} callback
   * @param {Object[]} callback.result
   */
  getObjects(tableName, ids, callback) {
    if (!this.tables[tableName]) return callback([]);
    const data = [];

    // Gather, sort, and filter replica IDs
    const sortedIds = ids.sort();
    for (let i = sortedIds.length - 1; i > 0; i--) {
      if (sortedIds[i] === sortedIds[i - 1]) sortedIds.splice(i, 1);
    }
    let index = 0;

    // Iterate over the table searching for the specified IDs
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
            if (!this.isDestroyed) callback(data);
          } else {
            cursor.continue(sortedIds[index]);
          }
        };
    });
  }

  /**
   * Claim a Sync Event.
   *
   * A sync event is claimed by locking the table,  validating that it is still in the table... and then deleting it from the table.
   *
   * @method claimSyncEvent
   * @param {layer.SyncEvent} syncEvent
   * @param {Function} callback
   * @param {Boolean} callback.result
   */
  claimSyncEvent(syncEvent, callback) {
    if (!this.tables.syncQueue) return callback(true);
    this.onOpen(() => {
      const transaction = this.db.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      store.get(syncEvent.id).onsuccess = evt => callback(Boolean(evt.target.result));
      store.delete(syncEvent.id);
    });
  }

  /**
   * Delete all data from all tables.
   *
   * This should be called from layer.Client.logout()
   *
   * @method deleteTables
   * @param {Function} [calllback]
   */
  deleteTables(callback) {
    this.onOpen(() => {
      try {
        const transaction = this.db.transaction(TABLES, 'readwrite');
        TABLES.forEach(tableName => transaction.objectStore(tableName).clear());
        transaction.oncomplete = callback;
      } catch (e) {
        // Noop
      }
    });
  }
}

/**
 * @type {layer.Client} Layer Client instance
 */
DbManager.prototype.client = null;

/**
 * @type {boolean} is the db connection open
 */
DbManager.prototype.isOpen = false;

/**
 * @type {Object} A list of tables that are enabled.
 *
 * Disabled tables are omitted or false.
 * sync-events can only be enabled IF conversations and messages are enabled
 */
DbManager.prototype.tables = null;

/**
 * @type IDBDatabase
 */
DbManager.prototype.db = null;

DbManager.DisabledState = {
  identities: false,
  conversations: false,
  messages: false,
  syncQueue: false,
};

DbManager._supportedEvents = [
  'open',
];

Root.initClass.apply(DbManager, [DbManager, 'DbManager']);
module.exports = DbManager;
