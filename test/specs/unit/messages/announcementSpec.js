/* eslint-disable */
describe("The Announcement class", function() {
    var appId = "Fred's App";

    var client,
        announcement,
        requests;

    beforeEach(function() {
        jasmine.clock().install();
        jasmine.Ajax.install();
        requests = jasmine.Ajax.requests;
        client = new layer.Client({
            appId: appId,
            reset: true,
            url: "https://doh.com"
        });
        client.userId = "999";

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

        announcement = client._createObject(responses.announcement);

        requests.reset();
        jasmine.clock().tick(1);
        client._clientReady();
    });
    afterEach(function() {
        if (client) client.destroy();
        jasmine.Ajax.uninstall();
        jasmine.clock().uninstall();
    });

    afterAll(function() {
        layer.Client.destroyAllClients();
    });

    describe("The send() method", function() {
      it("Should do nothing", function() {
        spyOn(announcement, "_setSyncing");
        announcement.send();
        expect(announcement._setSyncing).not.toHaveBeenCalled();
      });
    });

    describe("The getConversation() method", function() {
      it("Should return undefined", function() {
        announcement.conversationId = "fred";
        expect(announcement.getConversation()).toBe(undefined);
      });
    });

    describe("The delete() method", function() {
        it("Should fail if already deleting", function() {
            // Setup
            announcement.delete(layer.Constants.DELETION_MODE.ALL);

            // Run
            expect(function() {
                announcement.delete();
            }).toThrowError(layer.LayerError.dictionary.isDestroyed);
        });

        it("Should call _xhr", function() {
            // Setup
            spyOn(announcement, "_xhr");

            // Run
            announcement.delete();

            // Posttest
            expect(announcement._xhr).toHaveBeenCalledWith({
                url: '',
                method: 'DELETE'
            }, jasmine.any(Function));
        });
    });
});
