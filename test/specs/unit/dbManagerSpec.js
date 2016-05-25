/*eslint-disable */

describe("The DbManager Class", function() {
    var appId = "Fred's App";

    var client,
        conversation,
        message,
        announcement,
        identity,
        basicIdentity,
        dbManager;

        var MAX_SAFE_INTEGER = 9007199254740991;

    beforeEach(function(done) {
        client = new layer.Client({
            appId: appId,
            url: "https://huh.com",
            isTrustedDevice: true
        });
        client.sessionToken = "sessionToken";
        client.userId = "Frodo";
        client._clientAuthenticated();
        client._clientReady();
        client.syncManager.queue = [];
        conversation = client._createObject(responses.conversation1);
        message = conversation.lastMessage;
        announcement = client._createObject(responses.announcement);
        identity = new layer.UserIdentity({
          clientId: client.appId,
          userId: client.userId,
          id: "layer:///identities/" + client.userId,
          firstName: "first",
          lastName: "last",
          phoneNumber: "phone",
          emailAddress: "email",
          metadata: {},
          publicKey: "public",
          avatarUrl: "avatar",
          displayName: "display",
          syncState: layer.Constants.SYNC_STATE.SYNCED,
          isFullIdentity: true
        });
        basicIdentity = new layer.UserIdentity({
          clientId: client.appId,
          userId: client.userId,
          id: "layer:///identities/" + client.userId,
          isFullIdentity: false
        });
        client.user = identity;
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

      it("Should listen for identities:add events", function() {
        spyOn(dbManager, "writeIdentities");
        client.trigger('identities:add', { identities: [identity] });
        expect(dbManager.writeIdentities).toHaveBeenCalledWith([identity], false);
      });

      it("Should listen for identities:change events", function() {
        spyOn(dbManager, "writeIdentities");
        client.trigger('identities:change', {
          target: identity,
          oldValue: 1,
          newValue: 2,
          property: 'displayName'
        });
        expect(dbManager.writeIdentities).toHaveBeenCalledWith([identity], true);
      });

      it("Should listen for identities:unfollow events", function() {
        spyOn(dbManager, "deleteObjects");
        client.trigger('identities:unfollow', { target: identity });
        expect(dbManager.deleteObjects).toHaveBeenCalledWith('identities', [identity]);
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
          last_message_sent: conversation.lastMessage.sentAt.toISOString(),
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

      it("Should generate a proper Message object", function() {
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
          is_unread: false,
          sender: {
            user_id: message.sender.userId || '',
            name: '',
            display_name: message.sender.displayName,
            avatar_url: message.sender.avatarUrl
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
        expect(message.sender.displayName.length > 0).toBe(true);
        expect(message.sender.avatarUrl.length > 0).toBe(true);
      });

      it("Should generate a proper Announcement object", function() {
        message = client._createObject(JSON.parse(JSON.stringify(responses.announcement)));
        message.receivedAt = new Date();
        expect(dbManager._getMessageData([message])).toEqual([{
          id: message.id,
          url: message.url,
          position: message.position,
          recipient_status: message.recipientStatus,
          sent_at: message.sentAt.toISOString(),
          received_at: message.receivedAt.toISOString(),
          is_unread: true,
          conversation: 'announcement',
          sender: {
            user_id: '',
            name: 'Hey ho',
            display_name: 'Hey ho',
            avatar_url: ''
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

      it("Should generate a proper Announcement object", function() {
        message = client._createObject(JSON.parse(JSON.stringify(responses.announcement)));
        message.receivedAt = new Date();
        expect(dbManager._getMessageData([message])).toEqual([{
          id: message.id,
          url: message.url,
          position: message.position,
          recipient_status: message.recipientStatus,
          sent_at: message.sentAt.toISOString(),
          received_at: message.receivedAt.toISOString(),
          conversation: 'announcement',
          is_unread: message.isUnread,
          sender: {
            user_id: '',
            name: 'Hey ho',
            display_name: 'Hey ho',
            avatar_url: ''
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


    describe("The _getIdentityData() method", function() {
      it("Should ignore anything that just came out of the database and clear _fromDB", function() {
        identity._fromDB = true;
        expect(dbManager._getIdentityData([identity])).toEqual([]);
        expect(identity._fromDB).toBe(false);
      });

      it("Should ignore Basic Identities", function() {
        expect(dbManager._getIdentityData([identity, basicIdentity])).toEqual(dbManager._getIdentityData([identity]));
      });

      it("Should ignore Loading Identities", function() {
        identity.syncState = layer.Constants.SYNC_STATE.LOADING;
        expect(dbManager._getIdentityData([identity, basicIdentity])).toEqual([]);
      });


      it("Should generate a proper Identity object", function() {
        expect(dbManager._getIdentityData([identity])).toEqual([{
          id: identity.id,
          url: identity.url,
          user_id: identity.userId,
          first_name: identity.firstName,
          last_name: identity.lastName,
          display_name: identity.displayName,
          email_address: identity.emailAddress,
          avatar_url: identity.avatarUrl,
          metadata: identity.metadata,
          public_key: identity.publicKey,
          phone_number: identity.phoneNumber,
          sync_state: identity.syncState,
        }]);
      });
    });

    describe("The writeIdentities() method", function() {
      it("Should forward isUpdate true to writeIdentities", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getIdentityData").and.returnValue([{id: 'fred'}]);
        dbManager.writeIdentities([identity], false);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('identities', jasmine.any(Object), false, undefined);
      });

      it("Should forward isUpdate true to writeIdentities", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getIdentityData").and.returnValue([{id: 'fred'}]);
        dbManager.writeIdentities([message], true);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('identities', jasmine.any(Object), true, undefined);
      });

      it("Should feed data from _getIdentityData to _writeObjects", function() {
        spyOn(dbManager, "_writeObjects");
        spyOn(dbManager, "_getIdentityData").and.returnValue([{id: 'fred'}]);
        dbManager.writeIdentities([message], false);
        expect(dbManager._writeObjects).toHaveBeenCalledWith('identities', [{id: 'fred'}], jasmine.any(Boolean), undefined);
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
        spyOn(dbManager, "_loadByIndex").and.callFake(function(tableName, sortIndex, range, isFromId, pageSize, callback) {
          callback(dbManager._getConversationData([conversation]));
        });
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          callback(dbManager._getMessageData([]));
        });
        spyOn(dbManager, "_loadConversationsResult");

        // Run
        var f = function() {};
        dbManager.loadConversations('last_message', null, null, f);

        // Posttest
        expect(dbManager._loadByIndex).toHaveBeenCalledWith('conversations', 'last_message_sent', null, false, null, jasmine.any(Function));
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
        spyOn(dbManager, "_loadByIndex").and.callFake(function(tableName, sortIndex, range, isFromId, pageSize, callback) {
          callback(dbManager._getConversationData([conversation]));
        });
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          callback(dbManager._getMessageData([]));
        });
        spyOn(dbManager, "_loadConversationsResult");

        // Run
        var f = function() {};
        dbManager.loadConversations('created_at', null, null, f);

        // Posttest
        expect(dbManager._loadByIndex).toHaveBeenCalledWith('conversations', 'created_at', null, false, null, jasmine.any(Function));
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
        spyOn(dbManager, "_loadByIndex").and.callFake(function(tableName, sortIndex, range, isFromId, pageSize, callback) {
          callback(dbManager._getConversationData([conversation]));
        });
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          callback(dbManager._getMessageData([message]));
        });
        spyOn(dbManager, "_loadConversationsResult");


        // Run
        var f = function() {};
        dbManager.loadConversations('created_at', null, null, f);

        // Posttest
        expect(dbManager._loadByIndex).toHaveBeenCalledWith('conversations', 'created_at', null, false, null, jasmine.any(Function));
        expect(dbManager.getObjects).toHaveBeenCalledWith('messages', [message.id], jasmine.any(Function));
        expect(dbManager._loadConversationsResult).toHaveBeenCalledWith(
          dbManager._getConversationData([conversation]),
          dbManager._getMessageData([message]),
          f
        );
      });

      it("Should use the fromId and pageSize properties", function() {
        spyOn(dbManager, "_loadByIndex")
        dbManager.loadConversations('created_at', conversation.id, 5);

        var range = dbManager._loadByIndex.calls.allArgs()[0][2];
        expect(dbManager._loadByIndex).toHaveBeenCalledWith('conversations', 'created_at', jasmine.any(IDBKeyRange), true, 5, jasmine.any(Function));
        expect(range.upper).toEqual([conversation.createdAt.toISOString()]);
        expect(range.lower).toEqual(undefined);
      });
    });


    describe("The _loadConversationsResult() method", function() {
      it("Should call _createMessage for each Message", function() {
        spyOn(dbManager, "_createMessage");
        var m1 = conversation.createMessage("m1").send();
        var m2 = conversation.createMessage("m2").send();

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


        var range = dbManager._loadByIndex.calls.allArgs()[0][2];
        expect(dbManager._loadByIndex).toHaveBeenCalledWith('messages', 'conversation', jasmine.any(IDBKeyRange), false, undefined, jasmine.any(Function));
        expect(range.lower).toEqual([conversation.id, 0]);
        expect(range.upper).toEqual([conversation.id, MAX_SAFE_INTEGER]);
      });

      it("Should call _loadByIndex with fromId and pageSize", function() {
        spyOn(dbManager, "_loadByIndex");
        dbManager.loadMessages(conversation.id, message.id, 12);

        var range = dbManager._loadByIndex.calls.allArgs()[0][2];
        expect(dbManager._loadByIndex).toHaveBeenCalledWith('messages', 'conversation', jasmine.any(IDBKeyRange), true, 12, jasmine.any(Function));
        expect(range.lower).toEqual([conversation.id, 0]);
        expect(range.upper).toEqual([conversation.id, message.position]);
      });

      it("Should call _loadMessagesResult", function() {
        spyOn(dbManager, "_loadMessagesResult");
        spyOn(dbManager, "_loadByIndex").and.callFake(function(table, index, range, isFromId, pageSize, callback) {
          callback([message]);
        });
        var spy = jasmine.createSpy('spy');
        dbManager.loadMessages(conversation.id, null, null, spy);
        expect(dbManager._loadMessagesResult).toHaveBeenCalledWith([message], spy);
      });
    });

    describe("The loadAnnouncements() method", function() {
      it("Should call _loadByIndex", function() {
        spyOn(dbManager, "_loadByIndex");
        dbManager.loadAnnouncements();

        var range = dbManager._loadByIndex.calls.allArgs()[0][2];
        expect(dbManager._loadByIndex).toHaveBeenCalledWith('messages', 'conversation', jasmine.any(IDBKeyRange), false, undefined, jasmine.any(Function));
        expect(range.lower).toEqual(['announcement', 0]);
        expect(range.upper).toEqual(['announcement', MAX_SAFE_INTEGER]);
      });

      it("Should call _loadByIndex with fromId", function() {
        spyOn(dbManager, "_loadByIndex");
        dbManager.loadAnnouncements(announcement.id, 12);
        var range = dbManager._loadByIndex.calls.allArgs()[0][2];
        expect(dbManager._loadByIndex).toHaveBeenCalledWith('messages', 'conversation', jasmine.any(IDBKeyRange), true, 12, jasmine.any(Function));
        expect(range.lower).toEqual(['announcement', 0]);
        expect(range.upper).toEqual(['announcement', announcement.position]);
      });

      it("Should call _loadMessagesResult", function() {
        spyOn(dbManager, "_loadMessagesResult");
        spyOn(dbManager, "_loadByIndex").and.callFake(function(table, index, query, isFromId, pageSize, callback) {
          callback([message]);
        });
        var spy = jasmine.createSpy('spy');
        dbManager.loadAnnouncements(null, null, spy);
        expect(dbManager._loadMessagesResult).toHaveBeenCalledWith([message], spy);
      });
    });

    describe("The _loadMessagesResult() method", function() {
      it("Calls createMessage on each message", function() {
        var m1 = conversation.createMessage("m1").send();
        var m2 = conversation.createMessage("m2").send();
        spyOn(dbManager, "_createMessage");

        // Run
        dbManager._loadMessagesResult(dbManager._getMessageData([m1, m2]));

        // Posttest
        expect(dbManager._createMessage).toHaveBeenCalledWith(dbManager._getMessageData([m1])[0]);
        expect(dbManager._createMessage).toHaveBeenCalledWith(dbManager._getMessageData([m2])[0]);
      });

      it("Returns new and existing messages", function() {
        var m1 = conversation.createMessage("m1").send();
        var m2 = conversation.createMessage("m2");
        client._messagesHash = {}
        client._messagesHash[m2.id] = m2;
        var spy = jasmine.createSpy('spy');

        // Run
        dbManager._loadMessagesResult(dbManager._getMessageData([m1, m2]), spy);

        // Posttest
        expect(spy).toHaveBeenCalledWith([jasmine.objectContaining({id: m1.id}), m2]);
      });
    });

    describe("The loadIdentities() method", function() {
      it("Should call _loadAll", function() {
        spyOn(dbManager, "_loadAll");
        dbManager.loadIdentities(function() {});
        expect(dbManager._loadAll).toHaveBeenCalledWith('identities', jasmine.any(Function));
      });

      it("Should call _loadIdentitiesResult", function() {
        spyOn(dbManager, "_loadIdentitiesResult");
        spyOn(dbManager, "_loadAll").and.callFake(function(table, callback) {
          callback([identity]);
        });
        var spy = jasmine.createSpy('spy');
        dbManager.loadIdentities(spy);
        expect(dbManager._loadIdentitiesResult).toHaveBeenCalledWith([identity], spy);
      });
    });

    describe("The _loadIdentitiesResult() method", function() {
      it("Calls _createIdentity on each identity", function() {
        spyOn(dbManager, "_createIdentity");
        basicIdentity.isFullIdentity = true;

        // Run
        dbManager._loadIdentitiesResult(dbManager._getIdentityData([identity, basicIdentity]));

        // Posttest
        expect(dbManager._createIdentity).toHaveBeenCalledWith(dbManager._getIdentityData([identity])[0]);
        expect(dbManager._createIdentity).toHaveBeenCalledWith(dbManager._getIdentityData([basicIdentity])[0]);
      });

      it("Only returns new identities", function() {
        client._identitiesHash = {}
        client._identitiesHash[identity.id] = identity;
        basicIdentity.isFullIdentity = true;
        var spy = jasmine.createSpy('spy');

        // Run
        dbManager._loadIdentitiesResult(dbManager._getIdentityData([identity, basicIdentity]), spy);

        // Posttest
        expect(spy).toHaveBeenCalledWith([identity, jasmine.objectContaining({id: basicIdentity.id})]);
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

    describe("The _createIdentity() method", function() {
      it("Should return an Identity", function() {
        delete client._identitiesHash[identity.id];
        expect(dbManager._createIdentity(dbManager._getIdentityData([identity])[0])).toEqual(jasmine.any(layer.Identity));
      });

      it("Should flag Identity with _fromDB property", function() {
        delete client._identitiesHash[identity.id];
        expect(dbManager._createIdentity(dbManager._getIdentityData([identity])[0])._fromDB).toBe(true);
      });

      it("Should do nothing if the Identity already is instantiated", function() {
        client._identitiesHash[identity.id] = identity;
        expect(dbManager._createIdentity(dbManager._getIdentityData([identity])[0])).toBe(undefined);
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

      it("Should not call _createConversation for deleted conversationIds", function() {
        var rawConversation = dbManager._getConversationData([conversation])[0];
        spyOn(dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
          expect(ids.indexOf(rawSyncEvents[0].target) === -1).toBe(true);
          callback([]);
        });
        spyOn(dbManager, "_createConversation");
        rawSyncEvents[0].operation = "DELETE";
        dbManager._loadSyncEventRelatedData(rawSyncEvents, function() {});
        expect(dbManager._createConversation).not.toHaveBeenCalledWith(rawConversation);
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
          }),
          new layer.XHRSyncEvent({
            target: conversation.id + 'b',
            depends: [],
            operation: "DELETE",
            id: "derf",
            data: {ho: "hey"},
            headers: {accept: 'ho'},
            method: "DELETE",
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
        expect(result.filter(function(item) {
          return item.target == conversation.id + 'a';
        })).toEqual([]);
      });

      it("Should not filter out SyncEvents whose target cant be found if its a DELETE operation", function() {
        var result;
        dbManager._loadSyncEventResults(dbManager._getSyncEventData(syncEvents), function(events) {
          result = events;
        });

        expect(result.filter(function(item) {
          return item.target == conversation.id + 'b';
        })[0].id).toEqual(syncEvents[2].id);
      });
    });

    describe("The _loadAll() method", function() {
      var m1, m2, m3, m4;
      beforeEach(function(done) {
        dbManager.deleteTables(function() {
          m1 = conversation.createMessage("m1").send();
          m2 = conversation.createMessage("m2").send();
          m3 = conversation.createMessage("m3").send();
          m4 = conversation.createMessage("m4").send();
          dbManager._writeObjects('messages', dbManager._getMessageData([message, m4, m2, m3, m1]), false, done);
        });
      });

      it("Should load everything in the table", function(done) {
        dbManager._loadAll('messages', function(result) {
          var sortedExpect =  layer.Util.sortBy(dbManager._getMessageData([message, m4, m3, m2, m1]), function(item) {return item.id});
          expect(result).toEqual(sortedExpect);
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
        dbManager.deleteTables(function() {
          var c2 = client.createConversation(["c2"]);
          message = conversation.createMessage("first message").send();
          m1 = conversation.createMessage("m1").send();
          m2 = conversation.createMessage("m2").send();
          m3 = c2.createMessage("m3").send();
          m4 = c2.createMessage("m4").send();
          setTimeout(function() {
            dbManager._writeObjects('messages', dbManager._getMessageData([m1, m2, m3, m4]), false, done);
          }, 200);
        });
      });

      it("Should get only items matching the index", function(done) {
        const query = window.IDBKeyRange.bound([conversation.id, 0], [conversation.id, MAX_SAFE_INTEGER]);
        dbManager._loadByIndex('messages', 'conversation', query, false, null, function(result) {
          var sortedExpect =  layer.Util.sortBy(dbManager._getMessageData([m2, m1, message]), function(item) {return item.position}).reverse();

          expect(result).toEqual(sortedExpect);
          done();
        });
      });

      it("Should apply pageSize", function(done) {
        const query = window.IDBKeyRange.bound([conversation.id, 0], [conversation.id, MAX_SAFE_INTEGER]);
        dbManager._loadByIndex('messages', 'conversation', query, false, 2, function(result) {
          var sortedExpect =  layer.Util.sortBy(dbManager._getMessageData([message, m2, m1]), function(item) {return item.position}).reverse();

          expect(result).toEqual([sortedExpect[0], sortedExpect[1]]);
          done();
        });
      });

      it("Should skip first result if isFromId", function() {
        const query = window.IDBKeyRange.bound([conversation.id, 0], [conversation.id, MAX_SAFE_INTEGER]);
        dbManager._loadByIndex('messages', 'conversation', query, true, null, function(result) {
          var sortedExpect =  layer.Util.sortBy(dbManager._getMessageData([message, m2, m1]), function(item) {return item.position}).reverse();

          expect(result).toEqual([sortedExpect[1], sortedExpect[2]]);
          done();
        });
      });


      it("Should get nothing if disabled", function(done) {
        dbManager.tables.messages = false;
        const query = window.IDBKeyRange.bound([conversation.id, 0], [conversation.id, MAX_SAFE_INTEGER]);
        dbManager._loadByIndex('messages', 'conversation', query, false, null, function(result) {
          expect(result).toEqual([]);
          done();
        });
      });
    });


    describe("The deleteObjects() method", function() {

      var m1, m2, m3, m4;
      beforeEach(function(done) {
        dbManager.deleteTables(function() {
          m1 = conversation.createMessage("m1").send();
          m2 = conversation.createMessage("m2").send();
          m3 = conversation.createMessage("m3").send();
          m4 = conversation.createMessage("m4").send();
          dbManager._writeObjects('messages', dbManager._getMessageData([m1, m2, m3, m4]), false, function() {
            setTimeout(done, 200);
          });
        });
      });

      it("Should delete all of the specified items", function(done) {
        dbManager.deleteObjects('messages', [m1, m3], function() {
          dbManager._loadAll('messages', function(result) {
            var sortedExpect =  layer.Util.sortBy(dbManager._getMessageData([m4, m2]), function(item) {return item.id});
            expect(result).toEqual(sortedExpect);
            done();
          });
        });
      });
    });

    describe("The getObjects() method", function() {
      var m1, m2, m3, m4;
      beforeEach(function(done) {
        m1 = conversation.createMessage("m1").send();
        m2 = conversation.createMessage("m2").send();
        m3 = conversation.createMessage("m3").send();
        m4 = conversation.createMessage("m4").send();
        dbManager._writeObjects('messages', dbManager._getMessageData([m1, m2, m3, m4]), false, done);
      });
      it("Should get the specified objects", function(done) {
        dbManager.getObjects('messages', [m2.id, m4.id, m1.id], function(result) {
          var sortedExpect =  layer.Util.sortBy(dbManager._getMessageData([m2, m4, m1]), function(item) {return item.id});

          expect(result).toEqual(sortedExpect);
          done();
        });
      });
    });


});