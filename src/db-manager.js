/**
 * Persistence manager
 *
 * @class layer.db-manager
 */

const DB_VERSION = 9;
const Root = require('./root');

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

    this.client.on('conversations:delete', evt => this.deleteConversations([evt.target]));
    this.client.on('messages:delete', evt => this.deleteMessages([evt.target]));
  }


  open() {
    const request = window.indexedDB.open('LayerWebSDK_' + this.client.appId + '_' + this.client.userId, DB_VERSION);
    request.onupgradeneeded = (evt) => this._onUpgradeNeeded(evt);
    request.onsuccess = (evt) => {
      const db = evt.target.result;
      this.trigger('open', {
        db,
      });
    };
    return this;
  }

  _onUpgradeNeeded(event) {
    const db = event.target.result;
    try {
      db.deleteObjectStore('conversations');
      db.deleteObjectStore('identities');
      db.deleteObjectStore('messages');
    } catch (e) {
      // Noop
    }
    const stores = [
      db.createObjectStore('conversations', { keyPath: 'id' }),
      db.createObjectStore('messages', { keyPath: 'id' }),
      db.createObjectStore('identities', { keyPath: 'id' }),
    ];

    stores[1].createIndex('conversation', 'conversation', { unique: false });


    let completeCount = 0;
    function onComplete() {
      completeCount++;
      if (completeCount === stores.length) {
        this.trigger('open', {
          db,
        });
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
    this.open().once('open', openEvt => {
      const db = openEvt.db;
      db.error = err => {
        console.error('Persistence Error: ', err);
        db.close();
      };
      this._writeObjects(db, isUpdate, 'conversations', data, (count) => {
        if (count === data.length) {
          setTimeout(() => db.close(), 100);
        }
      });
    });
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
        sender: message.sender,
        recipient_status: message.recipientStatus,
        sent_at: getDate(message.sentAt),
        received_at: getDate(message.receivedAt),
        conversation: message.conversationId,
      };
      return item;
    });
    this.open().once('open', openEvt => {
      const db = openEvt.db;
      db.error = err => {
        console.error('Persistence Error: ', err);
        db.close();
      };

      this._writeObjects(db, isUpdate, 'messages', data, (count) => {
        if (count === data.length) {
          setTimeout(() => db.close(), 100);
        }
      });
    });
  }

  // TODO: Count the number of transactions, and the number of transaction.oncomplete calls and only then call the callback
  _writeObjects(db, isUpdate, tableName, data, callback) {
    const transaction = db.transaction([tableName], 'readwrite');
    const store = transaction.objectStore(tableName);
    let count = 0;

    function onComplete() {
      count++;
      callback(count);
    }

    // data.forEach(item => isUpdate ? store.put(item) : store.add(item));
    data.forEach(item => {
      const req = store.add(item);
      req.onsuccess = onComplete;
      req.onerror = () => {
        const subtransaction = db.transaction([tableName], 'readwrite');
        const substore = subtransaction.objectStore(tableName);
        const subreq = substore.put(item);
        subreq.onsuccess = onComplete;
        subreq.onerror = onComplete;
      };
    });
  }

  loadConversations(callback) {
    this.open().once('open', openEvt => {
      const db = openEvt.db;
      db.error = err => {
        console.error('Persistence Error: ', err);
        db.close();
        callback([]);
      };
      this._loadAll(db, 'conversations', data => {
        const newData = [];
        db.close();
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
    });
  }

  loadMessages(conversationId, callback) {
    this.open().once('open', openEvt => {
      const db = openEvt.db;
      db.error = err => {
        console.error('Persistence Error: ', err);
        db.close();
        callback([]);
      };
      this._loadByIndex(db, 'messages', 'conversation', conversationId, data => {
        const newData = [];
        db.close();
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
    });
  }

  _loadAll(db, tableName, callback) {
    const data = [];
    db.transaction([tableName], 'readonly').objectStore(tableName).openCursor().onsuccess = (evt) => {
      const cursor = evt.target.result;
      if (cursor) {
        data.push(cursor.value);
        cursor.continue();
      } else {
        callback(data);
      }
    };
  }

  _loadByIndex(db, tableName, indexName, indexValue, callback) {
    const data = [];
    const range = IDBKeyRange.only(indexValue);
    db.transaction([tableName], 'readonly').objectStore(tableName).index(indexName).openCursor(range).onsuccess = (evt) => {
      const cursor = evt.target.result;
      if (cursor) {
        data.push(cursor.value);
        cursor.continue();
      } else {
        callback(data);
      }
    };
  }

  deleteConversations(conversation) {

  }

  deleteMessage(message) {


  }

  // TODO: For when the user logs out
  deleteAll() {
    this.open().once('open', openEvt => {
      const db = openEvt.db;
      try {
        db.deleteObjectStore('conversations');
        db.deleteObjectStore('identities');
        db.deleteObjectStore('messages');
      } catch (e) {
        // Noop
      }
    });
  }
}

DbManager.prototype.client = null;

DbManager._supportedEvents = [
  'open',
];

Root.initClass.apply(DbManager, [DbManager, 'DbManager']);
module.exports = DbManager;
