/*eslint-disable */
describe("The DbManager Class", function() {
    var appId = "Fred's App";

    var client,
        conversation,
        message,
        dbManager;

    beforeEach(function(done) {
        client = new layer.Client({
            appId: appId,
            url: "https://huh.com",
            isTrustedDevice: true
        });
        client.sessionToken = "sessionToken";
        client.userId = "Frodo";
        client._clientReady();
        client.syncManager.queue = [];
        conversation = client._createObject(responses.conversation1).conversation;
        message = conversation.lastMessage;
        dbManager = client.dbManager;
        dbManager.deleteTables(function() {
          done();
        });
    });

    afterEach(function() {
        client.destroy();
    });

    describe("The constructor() method", function() {
      it("Should listen for conversations:add events", function() {
        spyOn(dbManager, "writeConversations");
        client.trigger('conversations:add', { conversations: [conversation] });
        expect(dbManager.writeConversations).toHaveBeenCalledWith([conversation], false);
      });

      it("Should listen for conversations:change events", function() {
        spyOn(dbManager, "writeConversations");
        client.trigger('conversations:change', {
          target: conversation,
          oldValue: 1,
          newValue: 2,
          property: 'unreadCount'
        });
        expect(dbManager.writeConversations).toHaveBeenCalledWith([conversation], true);
      });

      it("Should listen for conversations:delete events", function() {
        spyOn(dbManager, "deleteObjects");
        client.trigger('conversations:delete', { target: conversation });
        expect(dbManager.deleteObjects).toHaveBeenCalledWith('conversations', [conversation]);
      });

      it("Should listen for messages:add events", function() {
        spyOn(dbManager, "writeMessages");
        client.trigger('messages:add', { messages: [message] });
        expect(dbManager.writeMessages).toHaveBeenCalledWith([message], false);
      });

      it("Should listen for messages:change events", function() {
        spyOn(dbManager, "writeMessages");
        client.trigger('messages:change', {
          target: message,
          oldValue: 1,
          newValue: 2,
          property: 'unreadCount'
        });
        expect(dbManager.writeMessages).toHaveBeenCalledWith([message], true);
      });

      it("Should listen for messages:delete events", function() {
        spyOn(dbManager, "deleteObjects");
        client.trigger('messages:delete', { target: message });
        expect(dbManager.deleteObjects).toHaveBeenCalledWith('messages', [message]);
      });

      it("Should listen for sync:add events", function() {
        var syncEvent = new layer.XHRSyncEvent({});
        spyOn(dbManager, "writeSyncEvents");
        client.syncManager.trigger('sync:add', { request: syncEvent });
        expect(dbManager.writeSyncEvents).toHaveBeenCalledWith([syncEvent], false);
      });

      it("Should listen for sync:abort events", function() {
        var syncEvent = new layer.XHRSyncEvent({});
        spyOn(dbManager, "deleteObjects");
        client.syncManager.trigger('sync:abort', { request: syncEvent });
        expect(dbManager.deleteObjects).toHaveBeenCalledWith('syncQueue', [syncEvent]);
      });

      it("Should listen for sync:error events", function() {
        var syncEvent = new layer.XHRSyncEvent({});
        spyOn(dbManager, "deleteObjects");
        client.syncManager.trigger('sync:error', { request: syncEvent });
        expect(dbManager.deleteObjects).toHaveBeenCalledWith('syncQueue', [syncEvent]);
      });

      it("Should call _open", function() {
        var _open = layer.DbManager.prototype._open;
        spyOn(layer.DbManager.prototype, "_open");
        var dbManager = new layer.DbManager({
          client: client,
          tables: {conversations: true}
         });

        // Posttest
        expect(layer.DbManager.prototype._open).toHaveBeenCalledWith();

        // Cleanup
        layer.DbManager.prototype._open = _open;
      });

      it("Should accept a tables property", function() {
        var dbManager = new layer.DbManager({
          client: client,
          tables: {
            conversations: true,
            messages: true,
            identities: false,
            syncQueue: true
          }
        });
        expect(dbManager.tables).toEqual({
          conversations: true,
          messages: true,
          identities: false,
          syncQueue: true
        });
      });

      it("Should set syncQueue to false if either conversations or messages are false", function() {
        var dbManager = new layer.DbManager({
          client: client,
          tables: {
            conversations: true,
            messages: false,
            identities: false,
            syncQueue: true
          }
        });
        expect(dbManager.tables).toEqual({
          conversations: true,
          messages: false,
          identities: false,
          syncQueue: false
        });

      });
    });

    describe("The _open() method", function() {
      it("Should callback immediately if no tables enabled", function() {
        dbManager.tables = {
          conversations: false,
          messages: false,
          identities: false,
          syncQueue: false
        };
        var done = false;
        dbManager.onOpen(function() {
          done = true;
        });
        expect(done).toBe(true);
      });
      it("Should trigger open event", function(done) {
        var dbManager = new layer.DbManager({
          client: client,
          tables: {conversations: true}
         });
        dbManager.on('open', function() {
          expect(dbManager.isOpen).toBe(true);
          expect(dbManager.db).not.toEqual(null);
          done();
        });
      });

      xit("Should call _onUpgradeNeeded", function() {

      });
    });

    describe("The onOpen() method", function() {
      it("Should callback when open", function(done) {
        var dbManager = new layer.DbManager({
          client: client,
          tables: {conversations: true}
         });
         dbManager.onOpen(function() {
          expect(dbManager.isOpen).toBe(true);
          done();
        });
      });

      it("Should callback immediately if open", function() {
        var spy = jasmine.createSpy('opOpen');
        var dbManager = new layer.DbManager({
          client: client,
          tables: {conversations: true}
         });
        dbManager.isOpen = true;
        dbManager.onOpen(spy);
        expect(spy).toHaveBeenCalledWith();
      });
    });

    xdescribe("The _onUpgradeNeeded() method", function() {

    });

    describe("The _getConversationData() method", function() {
      it("Should ignore anything that just came out of the database and clear _fromDB", function() {
        conversation._fromDB = true;
        expect(dbManager._getConversationData([conversation])).toEqual([]);
        expect(conversation._fromDB).toBe(false);
      });

      it("Should ignore loading Conversations", function() {
        conversation.syncState = layer.Constants.SYNC_STATE.LOADING;
        expect(dbManager._getConversationData([conversation])).toEqual([]);
      });

      it("Should generate a proper object", function() {
        expect(dbManager._getConversationData([conversation])).toEqual([{
          id: conversation.id,
          url: conversation.url,
          participants: conversation.participants,
          distinct: conversation.distinct,
          created_at: conversation.createdAt.toISOString(),
          metadata: conversation.metadata,
          unread_message_count: conversation.unreadCount,
          last_message: conversation.lastMessage.id,
          sync_state: conversation.syncState
        }]);
      });
    });

    describe("The writeConversations() method", function() {
      it("Should forward isUpdate true to writeMessages", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getConversationData").and.returnValue([{id: 'fred'}]);
        dbManager.writeConversations([conversation], false);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('conversations', [jasmine.any(Object)], false, undefined);
      });

      it("Should forward isUpdate true to writeMessages", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getConversationData").and.returnValue([{id: 'fred'}]);
        dbManager.writeConversations([conversation], true);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('conversations', [jasmine.any(Object)], true, undefined);
      });

      it("Should feed data from _getConversationData to _writeObjects", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getConversationData").and.returnValue([{id: 'fred'}]);
        dbManager.writeConversations([conversation], false);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('conversations', [{id: 'fred'}], jasmine.any(Boolean), undefined);
      });
    });

    describe("The _getMessageData() method", function() {
      it("Should ignore anything that just came out of the database and clear _fromDB", function() {
        message._fromDB = true;
        expect(dbManager._getMessageData([message])).toEqual([]);
        expect(message._fromDB).toBe(false);
      });

      it("Should ignore loading messages", function() {
        message.syncState = layer.Constants.SYNC_STATE.LOADING;
        expect(dbManager._getMessageData([message])).toEqual([]);
      });

      it("Should generate a proper object", function() {
        message = conversation.createMessage("hey ho");
        message.receivedAt = new Date();
        expect(dbManager._getMessageData([message])).toEqual([{
          id: message.id,
          url: message.url,
          position: message.position,
          recipient_status: message.recipientStatus,
          sent_at: message.sentAt.toISOString(),
          received_at: message.receivedAt.toISOString(),
          conversation: message.conversationId,
          sender: {
            user_id: message.sender.user_id || '',
            name: ''
          },
          sync_state: message.syncState,
          parts: [{
            id: message.parts[0].id,
            body: message.parts[0].body,
            encoding: message.parts[0].encoding,
            mime_type: message.parts[0].mimeType,
            content: null
          }]
        }]);
      });

      it("Should generate a proper Content object", function() {
        expect(dbManager._getMessageData([message])[0]).toEqual(jasmine.objectContaining({
          parts: [{
            id: message.parts[0].id,
            body: message.parts[0].body,
            encoding: message.parts[0].encoding,
            mime_type: message.parts[0].mimeType,
            content: null
          }, {
            id: message.parts[1].id,
            body: message.parts[1].body,
            encoding: message.parts[1].encoding,
            mime_type: message.parts[1].mimeType,
            content: {
              download_url: message.parts[1]._content.downloadUrl,
              expiration:   message.parts[1]._content.expiration,
              id:  message.parts[1]._content.id,
              refresh_url:  message.parts[1]._content.refreshUrl,
              size:  message.parts[1]._content.size
            }
          }]
        }));
      });
    });

    describe("The writeMessages() method", function() {
      it("Should forward isUpdate true to writeMessages", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getMessageData").and.returnValue([{id: 'fred'}]);
        dbManager.writeMessages([message], false);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('messages', jasmine.any(Object), false, undefined);
      });

      it("Should forward isUpdate true to writeMessages", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getMessageData").and.returnValue([{id: 'fred'}]);
        dbManager.writeMessages([message], true);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('messages', jasmine.any(Object), true, undefined);
      });

      it("Should feed data from _getMessageData to _writeObjects", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getMessageData").and.returnValue([{id: 'fred'}]);
        dbManager.writeMessages([message], false);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('messages', [{id: 'fred'}], jasmine.any(Boolean), undefined);
      });
    });

    describe("The _getSyncEventData() method", function() {
      var syncEvent;
      beforeEach(function() {
        syncEvent = new layer.XHRSyncEvent({
          target: "fred",
          depends: ["joe", "fred"],
          operation: "brain removal",
          data: {
            zombieCount: "cant count without brains"
          },
          url: "sue",
          headers: {'content-type': 'mountain/text'},
          method: 'POST',
          createdAt: Date.now()
        });
      });

      it("Should ignore anything that just came out of the database and clear fromDB", function() {
        syncEvent.fromDB = true;
        expect(dbManager._getSyncEventData([syncEvent])).toEqual([]);
        expect(syncEvent.fromDB).toBe(false);
      });

      it("Should generate a proper object", function() {
        expect(dbManager._getSyncEventData([syncEvent])).toEqual([{
          id: syncEvent.id,
          url: syncEvent.url,
          target: syncEvent.target,
          depends: syncEvent.depends,
          data: syncEvent.data,
          isWebsocket: false,
          created_at: syncEvent.createdAt,
          method: syncEvent.method,
          headers: syncEvent.headers,
          operation: syncEvent.operation
        }]);
      });

      it("Should generate a proper object", function() {
        var syncEvent = new layer.WebsocketSyncEvent({
          target: "fred",
          depends: ["joe", "fred"],
          operation: "brain removal",
          data: {
            zombieCount: "cant count without brains"
          },
          method: 'POST',
          createdAt: Date.now()
        });
        expect(dbManager._getSyncEventData([syncEvent])).toEqual([{
          id: syncEvent.id,
          url: '',
          target: syncEvent.target,
          depends: syncEvent.depends,
          data: syncEvent.data,
          isWebsocket: true,
          created_at: syncEvent.createdAt,
          method: null,
          headers: null,
          operation: syncEvent.operation
        }]);
      });
    });

    describe("The writeSyncEvents() method", function () {
      var syncEvent;
      beforeEach(function() {
        var syncEvent = new layer.XHRSyncEvent({
          target: "fred",
          depends: ["joe", "fred"],
          operation: "brain removal",
          data: {
            zombieCount: "cant count without brains"
          },
          url: "sue",
          headers: {'content-type': 'mountain/text'},
          method: 'POST',
          createdAt: new Date("2010-10-10")
        });
      });

      it("Should forward isUpdate true to writeSyncEvents", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getSyncEventData").and.returnValue([{id: 'fred'}]);
        dbManager.writeSyncEvents([syncEvent], false);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('syncQueue', jasmine.any(Object), false, undefined);
      });

      it("Should forward isUpdate true to writeSyncEvents", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getSyncEventData").and.returnValue([{id: 'fred'}]);
        dbManager.writeSyncEvents([syncEvent], true);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('syncQueue', jasmine.any(Object), true, undefined);
      });

      it("Should feed data from _getSyncEventData to _writeObjects", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getSyncEventData").and.returnValue([{id: 'fred'}]);
        dbManager.writeSyncEvents([syncEvent], false);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('syncQueue', [{id: 'fred'}], jasmine.any(Boolean), undefined);
      });
    });


    describe("The _writeObjects() method", function() {
      it("Should do nothing if no data", function() {
        var spy = jasmine.createSpy('spy');
        spyOn(dbManager, "onOpen");
        dbManager._writeObjects('conversations', [], true, spy);
        expect(spy).toHaveBeenCalledWith();
        expect(dbManager.onOpen).not.toHaveBeenCalled();
      });

      it("Should work through onOpen", function() {
        spyOn(dbManager, "onOpen");
        dbManager._writeObjects('conversations', [conversation], true, null);
        expect(dbManager.onOpen).toHaveBeenCalledWith(jasmine.any(Function));
      });

      it("Should write a conversation object", function(done) {
        dbManager._writeObjects('conversations', [{
          id: "frodo got no mojo",
          mojo: 5
        }], false, function() {
          dbManager.getObjects('conversations', ['frodo got no mojo'], function(result) {
            expect(result).toEqual([{
              id: 'frodo got no mojo',
              mojo: 5
            }]);
            done();
          });
        });
      });

      it("Should update a conversation object if called with isUpdate", function(done) {
        dbManager._writeObjects('conversations', [{
          id: "frodo got no mojo",
          mojo: 5
        }], false, function() {
          dbManager._writeObjects('conversations', [{
            id: "frodo got no mojo",
            mojo: 7
          }], true, function() {
            dbManager.getObjects('conversations', ['frodo got no mojo'], function(result) {
              expect(result).toEqual([{
                id: 'frodo got no mojo',
                mojo: 7
              }]);
              done();
            });
          });
        });
      });

      it("Should update a conversation object if called without isUpdate", function(done) {
        dbManager._writeObjects('conversations', [{
          id: "frodo got no mojo",
          mojo: 5
        }], false, function() {
          dbManager._writeObjects('conversations', [{
            id: "frodo got no mojo",
            mojo: 7
          }], false, function() {
            dbManager.getObjects('conversations', ['frodo got no mojo'], function(result) {
              expect(result).toEqual([{
                id: 'frodo got no mojo',
                mojo: 7
              }]);
              done();
            });
          });
        });
      });
    });

    describe("The loadConversations() method", function() {
      it("Should handle case where lastMessage is already loaded", function() {
        conversation.lastMessage = message;
        client._messagesHash[message.id] = message;
        client._conversationsHash = {};
        spyOn(dbManager, "_loadAll").and.callFake(function(tableName, callback) {
          callback(dbManager._getConversationData([conversation]));
        });
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          callback(dbManager._getMessageData([]));
        });
        spyOn(dbManager, "_loadConversationsResult");

        // Run
        var f = function() {};
        dbManager.loadConversations(f);

        // Posttest
        expect(dbManager._loadAll).toHaveBeenCalledWith('conversations', jasmine.any(Function));
        expect(dbManager.getObjects).toHaveBeenCalledWith('messages', [], jasmine.any(Function));
        expect(dbManager._loadConversationsResult).toHaveBeenCalledWith(
          dbManager._getConversationData([conversation]),
          [],
          f
        );
      });

      it("Should handle case where lastMessage is empty", function() {
        conversation.lastMessage = null;
        client._messagesHash = {};
        spyOn(dbManager, "_loadAll").and.callFake(function(tableName, callback) {
          callback(dbManager._getConversationData([conversation]));
        });
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          callback(dbManager._getMessageData([]));
        });
        spyOn(dbManager, "_loadConversationsResult");

        // Run
        var f = function() {};
        dbManager.loadConversations(f);

        // Posttest
        expect(dbManager._loadAll).toHaveBeenCalledWith('conversations', jasmine.any(Function));
        expect(dbManager.getObjects).toHaveBeenCalledWith('messages', [], jasmine.any(Function));
        expect(dbManager._loadConversationsResult).toHaveBeenCalledWith(
          dbManager._getConversationData([conversation]),
          [],
          f
        );
      });

      it("Should handle case where lastMessage is not already loaded", function() {
        conversation.lastMessage = message;
        delete client._messagesHash[message.id];
        spyOn(dbManager, "_loadAll").and.callFake(function(tableName, callback) {
          callback(dbManager._getConversationData([conversation]));
        });
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          callback(dbManager._getMessageData([message]));
        });
        spyOn(dbManager, "_loadConversationsResult");


        // Run
        var f = function() {};
        dbManager.loadConversations(f);

        // Posttest
        expect(dbManager._loadAll).toHaveBeenCalledWith('conversations', jasmine.any(Function));
        expect(dbManager.getObjects).toHaveBeenCalledWith('messages', [message.id], jasmine.any(Function));
        expect(dbManager._loadConversationsResult).toHaveBeenCalledWith(
          dbManager._getConversationData([conversation]),
          dbManager._getMessageData([message]),
          f
        );
      });
    });


    describe("The _loadConversationsResult() method", function() {
      it("Should call _createMessage for each Message", function() {
        spyOn(dbManager, "_createMessage");
        var m1 = conversation.createMessage("m1");
        var m2 = conversation.createMessage("m2");

        // Run
        dbManager._loadConversationsResult([], dbManager._getMessageData([m1, m2]));

        // Posttest
        expect(dbManager._createMessage).toHaveBeenCalledWith(dbManager._getMessageData([m1])[0]);
        expect(dbManager._createMessage).toHaveBeenCalledWith(dbManager._getMessageData([m2])[0]);
      });

      it("Should call _createConversation for each Conversation", function() {
        spyOn(dbManager, "_createConversation");
        var c1 = client.createConversation(["c1"]);
        var c2 = client.createConversation(["c2"]);

        // Run
        dbManager._loadConversationsResult(dbManager._getConversationData([c1, c2]), []);

        // Posttest
        expect(dbManager._createConversation).toHaveBeenCalledWith(dbManager._getConversationData([c1])[0]);
        expect(dbManager._createConversation).toHaveBeenCalledWith(dbManager._getConversationData([c2])[0]);
      });

      it("Should filter out any Conversation that was already loaded", function() {
        var callback = jasmine.createSpy('callback');
        var c1 = client.createConversation(["c1"]);
        var c2 = client.createConversation(["c2"]);
        client._conversationsHash = {};
        client._conversationsHash[c2.id] = c2;

        // Run
        dbManager._loadConversationsResult(dbManager._getConversationData([c1, c2]), [], callback);

        // Posttest
        expect(callback).toHaveBeenCalledWith([jasmine.objectContaining({id: c1.id}), jasmine.objectContaining({id: c2.id})]);
      });
    });

    describe("The loadMessages() method", function() {
      it("Should call _loadByIndex", function() {
        spyOn(dbManager, "_loadByIndex");
        dbManager.loadMessages(conversation.id);
        expect(dbManager._loadByIndex).toHaveBeenCalledWith('messages', 'conversation', conversation.id, jasmine.any(Function));
      });

      it("Should call _loadMessagesResult", function() {
        spyOn(dbManager, "_loadMessagesResult");
        spyOn(dbManager, "_loadByIndex").and.callFake(function(table, index, id, callback) {
          callback([message]);
        });
        var spy = jasmine.createSpy('spy');
        dbManager.loadMessages(conversation.id, spy);
        expect(dbManager._loadMessagesResult).toHaveBeenCalledWith([message], spy);
      });
    });

    describe("The _loadMessagesResult() method", function() {
      it("Calls createMessage on each message", function() {
        var m1 = conversation.createMessage("m1");
        var m2 = conversation.createMessage("m2");
        spyOn(dbManager, "_createMessage");

        // Run
        dbManager._loadMessagesResult(dbManager._getMessageData([m1, m2]));

        // Posttest
        expect(dbManager._createMessage).toHaveBeenCalledWith(dbManager._getMessageData([m1])[0]);
        expect(dbManager._createMessage).toHaveBeenCalledWith(dbManager._getMessageData([m2])[0]);
      });

      it("Only returns new messages", function() {
        var m1 = conversation.createMessage("m1");
        var m2 = conversation.createMessage("m2");
        client._messagesHash = {}
        client._messagesHash[m2.id] = m2;
        var spy = jasmine.createSpy('spy');

        // Run
        dbManager._loadMessagesResult(dbManager._getMessageData([m1, m2]), spy);

        // Posttest
        expect(spy).toHaveBeenCalledWith([jasmine.objectContaining({id: m1.id}), jasmine.objectContaining({id: m2.id})]);
      });
    });

    describe("The _createConversation() method", function() {
      it("Should return a Conversation", function() {
        delete client._conversationsHash[conversation.id];
        expect(dbManager._createConversation(dbManager._getConversationData([conversation])[0])).toEqual(jasmine.any(layer.Conversation));
      });

      it("Should flag Conversation with _fromDB property", function() {
        delete client._conversationsHash[conversation.id];
        expect(dbManager._createConversation(dbManager._getConversationData([conversation])[0])._fromDB).toBe(true);
      });

      it("Should clear lastMessage if the id is not found", function() {
        delete client._conversationsHash[conversation.id];
        delete client._messagesHash[conversation.lastMessage.id];
        expect(dbManager._createConversation(dbManager._getConversationData([conversation])[0]).lastMessage).toBe(null);
      });

      it("Should set lastMessage if the id is found", function() {
        delete client._conversationsHash[conversation.id];
        var message = conversation.lastMessage;
        expect(dbManager._createConversation(dbManager._getConversationData([conversation])[0]).lastMessage).toBe(message);
      });

      it("Should do nothing if the Conversation already is instantiated", function() {
        expect(dbManager._createConversation(dbManager._getConversationData([conversation])[0])).toBe(undefined);
      });
    });


    describe("The _createMessage() method", function() {
      it("Should return a Message", function() {
        delete client._messagesHash[message.id];
        expect(dbManager._createMessage(dbManager._getMessageData([message])[0])).toEqual(jasmine.any(layer.Message));
      });

      it("Should flag Message with _fromDB property", function() {
        delete client._messagesHash[message.id];
        expect(dbManager._createMessage(dbManager._getMessageData([message])[0])._fromDB).toBe(true);
      });

      it("Should do nothing if the Message already is instantiated", function() {
        client._messagesHash[message.id] = message;
        expect(dbManager._createMessage(dbManager._getMessageData([message])[0])).toBe(undefined);
      });
    });

    describe("The loadSyncQueue() method", function() {
      it("Should call _loadAll", function() {
        spyOn(dbManager, "_loadAll");
        dbManager.loadSyncQueue();
        expect(dbManager._loadAll).toHaveBeenCalledWith('syncQueue', jasmine.any(Function));
      });

      it("Should call _loadSyncEventRelatedData with results", function() {
        spyOn(dbManager, "_loadSyncEventRelatedData");
        var spy = jasmine.createSpy('callback');
        var syncEvent = new layer.XHRSyncEvent({});
        var syncEventRaw = dbManager._getSyncEventData([syncEvent])[0];
        spyOn(dbManager, "_loadAll").and.callFake(function(tableName, callback) {
          callback([syncEventRaw]);
        });

        dbManager.loadSyncQueue(spy);
        expect(dbManager._loadSyncEventRelatedData).toHaveBeenCalledWith([syncEventRaw], spy);
      });
    });

    describe("The _loadSyncEventRelatedData() method", function() {
      var rawSyncEvents;
      beforeEach(function() {
        rawSyncEvents = dbManager._getSyncEventData([
           new layer.XHRSyncEvent({
             target: conversation.id
           }),
           new layer.XHRSyncEvent({
             target: message.id
           })
        ]);
      });
      it("Should call getObjects for all messageIds", function() {
        spyOn(dbManager, "getObjects");
        dbManager._loadSyncEventRelatedData(rawSyncEvents, function() {});
        expect(dbManager.getObjects).toHaveBeenCalledWith('messages', [message.id], jasmine.any(Function));
      });

      it("Should call _createMessage for all messageIds", function() {
        var rawMessage = dbManager._getMessageData([message])[0];
        var fakeCount = 0;
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          if (fakeCount == 0) {
            fakeCount++;
            callback([rawMessage]);
          } else {
            callback([]);
          }
        });
        spyOn(dbManager, "_createMessage");
        dbManager._loadSyncEventRelatedData(rawSyncEvents, function() {});
        expect(dbManager._createMessage).toHaveBeenCalledWith(rawMessage);
      });

      it("Should call getObjects for all conversationIds", function() {
        var rawConversation = dbManager._getConversationData([conversation])[0];
        var fakeCount = 0;
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          if (fakeCount == 0) {
            fakeCount++;
            callback([]);
          } else {
            callback([rawConversation]);
          }
        });
        dbManager._loadSyncEventRelatedData(rawSyncEvents, function() {});
        expect(dbManager.getObjects).toHaveBeenCalledWith('conversations', [conversation.id], jasmine.any(Function));
      });

      it("Should call _createConversation for all conversationIds", function() {
        var rawConversation = dbManager._getConversationData([conversation])[0];
        var fakeCount = 0;
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          if (fakeCount == 0) {
            fakeCount++;
            callback([]);
          } else {
            callback([rawConversation]);
          }
        });
        spyOn(dbManager, "_createConversation");
        dbManager._loadSyncEventRelatedData(rawSyncEvents, function() {});
        expect(dbManager._createConversation).toHaveBeenCalledWith(rawConversation);
      });

      it("Should call _loadSyncEventResults", function() {
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          callback([]);
        });
        spyOn(dbManager, "_loadSyncEventResults");
        var spy = jasmine.createSpy('callback');
        dbManager._loadSyncEventRelatedData(rawSyncEvents, spy);
        expect(dbManager._loadSyncEventResults).toHaveBeenCalledWith(rawSyncEvents, spy);
      });
    });

    describe("The _loadSyncEventResults() method", function() {
      var syncEvents, now;
      beforeEach(function() {
        now = Date.now();
        syncEvents = [
          new layer.WebsocketSyncEvent({
            target: message.id,
            depends: [conversation.id],
            operation: "POST",
            id: "fred",
            data: {hey: "ho"},
            createdAt: now,
            fromDB: false
          }),
          new layer.XHRSyncEvent({
            target: conversation.id,
            depends: [],
            operation: "PATCH",
            id: "derf",
            data: {ho: "hey"},
            headers: {accept: 'ho'},
            method: "PATCH",
            url: "howdy",
            createdAt: now,
            fromDB: false
          }),
          new layer.XHRSyncEvent({
            target: conversation.id + 'a',
            depends: [],
            operation: "PATCH",
            id: "derf",
            data: {ho: "hey"},
            headers: {accept: 'ho'},
            method: "PATCH",
            url: "howdy",
            createdAt: now,
            fromDB: false
          })
        ];
        client._messagesHash[message.id] = message;
      });
      it("Should return XHRSyncEvents", function() {
        var result;
        dbManager._loadSyncEventResults(dbManager._getSyncEventData(syncEvents), function(events) {
          result = events;
        });
        expect(result[1].fromDB).toBe(true);
        result[1].fromDB = false;
        expect(result[1]).toEqual(syncEvents[1]);
      });

      it("Should return WebsocketSyncEvents", function() {
        var result;
        dbManager._loadSyncEventResults(dbManager._getSyncEventData(syncEvents), function(events) {
          result = events;
        });
        expect(result[0].fromDB).toBe(true);
        result[0].fromDB = false;
        expect(result[0]).toEqual(syncEvents[0]);
      });

      it("Should filter out SyncEvents whose target cant be found", function() {
        var result;
        dbManager._loadSyncEventResults(dbManager._getSyncEventData(syncEvents), function(events) {
          result = events;
        });
        expect(result.filter(item => item.target == conversation.id + 'a')).toEqual([]);
      });
    });

    describe("The _loadAll() method", function() {
      var m1, m2, m3, m4;
      beforeEach(function(done) {
        m1 = conversation.createMessage("m1");
        m2 = conversation.createMessage("m2");
        m3 = conversation.createMessage("m3");
        m4 = conversation.createMessage("m4");
        dbManager._writeObjects('messages', dbManager._getMessageData([m1, m2, m3, m4]), false, done);
      });

      it("Should load everything in the table", function(done) {
        dbManager._loadAll('messages', function(result) {
          var sortedResult = layer.Util.sortBy(result, function(item) {return item.id});
          var sortedExpect =  layer.Util.sortBy(dbManager._getMessageData([message, m4, m3, m2, m1]), function(item) {return item.id});
          expect(layer.Util.sortBy(result, function(item) {return item.id})).toEqual(sortedExpect);
          done();
        });
      });

      it("Should load nothing if table is", function(done) {
        dbManager.tables.messages = false;
        dbManager._loadAll('messages', function(result) {
          expect(result).toEqual([]);
          done();
        });
      });
    });

    describe("The _loadByIndex() method", function() {
      var m1, m2, m3, m4;
      beforeEach(function(done) {
        var c2 = client.createConversation(["c2"]);
        m1 = conversation.createMessage("m1");
        m2 = conversation.createMessage("m2");
        m3 = c2.createMessage("m3");
        m4 = c2.createMessage("m4");
        dbManager._writeObjects('messages', dbManager._getMessageData([m1, m2, m3, m4]), false, done);
      });
      it("Should get only items matching the index", function(done) {
        dbManager._loadByIndex('messages', 'conversation', conversation.id, function(result) {
          var sortedResult = layer.Util.sortBy(result, function(item) {return item.id});
          var sortedExpect =  layer.Util.sortBy(dbManager._getMessageData([message, m2, m1]), function(item) {return item.id});

          expect(sortedResult).toEqual(sortedExpect);
          done();
        });
      });

      it("Should get nothing if disabled", function(done) {
        dbManager.tables.messages = false;
        dbManager._loadByIndex('messages', 'conversation', conversation.id, function(result) {
          expect(result).toEqual([]);
          done();
        });
      });
    });


    describe("The deleteObjects() method", function() {

      var m1, m2, m3, m4;
      beforeEach(function(done) {
        m1 = conversation.createMessage("m1");
        m2 = conversation.createMessage("m2");
        m3 = conversation.createMessage("m3");
        m4 = conversation.createMessage("m4");
        dbManager._writeObjects('messages', dbManager._getMessageData([m1, m2, m3, m4]), false, done);
      });

      it("Should delete all of the specified items", function(done) {
        dbManager.deleteObjects('messages', [m1, m3], function() {
          dbManager._loadAll('messages', function(result) {
            var sortedResult = layer.Util.sortBy(result, function(item) {return item.id});
            var sortedExpect =  layer.Util.sortBy(dbManager._getMessageData([message, m4, m2]), function(item) {return item.id});
            expect(layer.Util.sortBy(result, function(item) {return item.id})).toEqual(sortedExpect);
            done();
          });
        });
      });
    });

    describe("The getObjects() method", function() {
      var m1, m2, m3, m4;
      beforeEach(function(done) {
        m1 = conversation.createMessage("m1");
        m2 = conversation.createMessage("m2");
        m3 = conversation.createMessage("m3");
        m4 = conversation.createMessage("m4");
        dbManager._writeObjects('messages', dbManager._getMessageData([m1, m2, m3, m4]), false, done);
      });
      it("Should get the specified objects", function(done) {
        dbManager.getObjects('messages', [m2.id, m4.id, m1.id], function(result) {
          var sortedResult = layer.Util.sortBy(result, function(item) {return item.id});
          var sortedExpect =  layer.Util.sortBy(dbManager._getMessageData([m2, m4, m1]), function(item) {return item.id});

          expect(sortedResult).toEqual(sortedExpect);
          done();
        });
      });
    });

    describe("The deleteTables() method", function() {
      beforeEach(function(done) {
        var m1 = conversation.createMessage("m1");
        var m2 = conversation.createMessage("m2");
        var m3 = conversation.createMessage("m3");
        var m4 = conversation.createMessage("m4");
        dbManager._writeObjects('messages', dbManager._getMessageData([m1, m2, m3, m4]), false, function() {
          var c1 = client.createConversation(["c1"]);
          var c2 = client.createConversation(["c2"]);
          dbManager._writeObjects('conversations', dbManager._getConversationData([c1, c2]), false, function() {
            var s1 = new layer.XHRSyncEvent({});
            var s2 = new layer.XHRSyncEvent({});
            dbManager._writeObjects('syncQueue', dbManager._getSyncEventData([s1, s2]), false, done);
            client.syncManager.queue = [];
          });
        });
      });
      it("Should delete all data from all tables", function(done) {
        dbManager.deleteTables(function() {
          dbManager._loadAll('conversations', function(cResult) {
            expect(cResult).toEqual([]);
            dbManager._loadAll('messages', function(mResult) {
              expect(mResult).toEqual([]);
              dbManager._loadAll('syncQueue', function(sResult) {
                expect(sResult).toEqual([]);
                done();
              });
            });
          });
        });
      });
    });

    describe("The claimSyncEvent() method", function() {
      var syncEvent;
      beforeEach(function(done) {
        syncEvent = new layer.XHRSyncEvent({
          target: "fred",
          depends: ["joe", "fred"],
          operation: "brain removal",
          data: {
            zombieCount: "cant count without brains"
          },
          url: "sue",
          headers: {'content-type': 'mountain/text'},
          method: 'POST',
          createdAt: new Date("2010-10-10")
        });
        dbManager.writeSyncEvents([syncEvent], false, done);
      });

      it("Should only allow a single request to work", function(done) {
        var callbackCount = 0, successCount = 0;
        for (var i = 0; i < 2; i++) {
          dbManager.claimSyncEvent(syncEvent, function(result) {
            callbackCount++;
            if (result) successCount++;
            if (callbackCount == 2) {
              expect(successCount).toEqual(1);
              done();
            }
          });
        }
      });
    });
});