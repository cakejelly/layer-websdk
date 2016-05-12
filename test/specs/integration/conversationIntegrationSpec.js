/*eslint-disable */
describe("Conversation Integration Tests", function() {
    var socket, client, syncManager, request;
    var appId = "Fred's App";

    beforeEach(function() {
        jasmine.clock().install();
        jasmine.Ajax.install();
        requests = jasmine.Ajax.requests;
        client = new layer.Client({
            appId: appId,
            url: "https://huh.com",
            isTrustedDevice: false
        });
        client.sessionToken = "sessionToken";
        client.userId = "Frodo";
        client.user = new layer.UserIdentity({
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
            isFullIdentity: true,
            sessionOwner: true
        });


        client._clientAuthenticated();
        getObjectsResult = [];
        spyOn(client.dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
            setTimeout(function() {
                callback(getObjectsResult);
            }, 10);
        });
        client._clientReady();
        client.onlineManager.isOnline = true;

        conversation = client._createObject(JSON.parse(JSON.stringify(responses.conversation1)));
        requests.reset();
        client.syncManager.queue = [];
        jasmine.clock().tick(1);
        syncManager = new layer.SyncManager({
            client: client,
            onlineManager: client.onlineManager,
            socketManager: client.socketManager,
            requestManager: client.socketRequestManager
        });
        client.onlineManager.isOnline = true;
        client.socketManager._socket = {
            send: function() {},
            addEventListener: function() {},
            removeEventListener: function() {},
            close: function() {},
            readyState: WebSocket.OPEN
        };
        request = new layer.XHRSyncEvent({
            method: "POST",
            data: {hey: "ho"},
            target: "fred",
            callback: function() {}
        });
        syncManager.queue = [request];
        client._clientReady();
    });

    afterAll(function() {
        layer.Client.destroyAllClients();
    });


    it("Should reload participants on error and refire a conversations:change event", function() {

      // Run replaceParticipant and have it fail
      conversation.replaceParticipants([client.userId, "argh"]);
      requests.mostRecent().response({
        status: 500,
        data: {}
      });

      // Run Conversation.load
      spyOn(conversation, "_triggerAsync");
      requests.mostRecent().response({
        status: 200,
        responseText: JSON.stringify(responses.conversation1)
      });


      // Posttest
      expect(conversation._triggerAsync).toHaveBeenCalledWith("conversations:change", jasmine.objectContaining({
        oldValue: [client.userId, "argh"],
        newValue: responses.conversation1.participants,
        property: "participants"
      }));
    });

    it("Should reload metadata on error and refire a conversations:change event", function() {
      var initialMetadata = JSON.parse(JSON.stringify(responses.conversation1.metadata));
      initialMetadata.hey = "ho";

      // Run setMetadataProperties and have it fail
      conversation.setMetadataProperties({hey: "ho"});
      requests.mostRecent().response({
        status: 500,
        data: {}
      });

      // Run Conversation.load
      spyOn(conversation, "_triggerAsync");
      requests.mostRecent().response({
        status: 200,
        responseText: JSON.stringify(responses.conversation1)
      });


      // Posttest
      expect(conversation._triggerAsync).toHaveBeenCalledWith("conversations:change", jasmine.objectContaining({
        oldValue: initialMetadata,
        newValue: responses.conversation1.metadata,
        property: "metadata"
      }));
    });

});