/*eslint-disable */

describe("The Identity Class", function() {
    var appId = "Fred's App";

    var client,
        identity,
        basicIdentity,
        serviceIdentity,
        dbManager,
        requests;

    beforeEach(function(done) {
        jasmine.clock().install();
        jasmine.Ajax.install();
        requests = jasmine.Ajax.requests;
        client = new layer.Client({
            appId: appId,
            url: "https://huh.com",
            isTrustedDevice: true
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
        spyOn(client.dbManager, "claimSyncEvent").and.callFake(function(syncEvent, callback) {
          callback([]);
        });
        client._clientReady();
        client.onlineManager.isOnline = true;

        client.syncManager.queue = [];
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
          userId: client.userId + "a",
          id: "layer:///identities/" + client.userId + "a",
          isFullIdentity: false
        });
        serviceIdentity = new layer.ServiceIdentity({
          clientId: client.appId,
          name: "Sauron the Sore",
          id: "layer:///serviceidentities/Sauron the Sore"
        });

        dbManager = client.dbManager;
        dbManager.deleteTables(function() {
          done();
        });
    });

    afterEach(function() {
        client.destroy();
        jasmine.clock().uninstall();
        jasmine.Ajax.uninstall();
    });

    describe("The UserIdentity class", function() {

      describe("The constructor() method", function() {
        it("Should call populateFromServer if fromServer", function() {
          var populateFromServer = layer.UserIdentity.prototype._populateFromServer;
          spyOn(layer.UserIdentity.prototype, "_populateFromServer");
          new layer.UserIdentity({
            fromServer: {
            },
            client: client
          });

          // Posttest
          expect(layer.UserIdentity.prototype._populateFromServer).toHaveBeenCalledWith({});

          // Cleanup
          layer.UserIdentity.prototype._populateFromServer = populateFromServer;
        });

        it("Should fail if no client or clientId", function() {
          expect(function() {
            new layer.UserIdentity({});
          }).toThrowError(layer.LayerError.dictionary.clientMissing);
        });

        it("Should work if client", function() {
          new layer.UserIdentity({
            client: client
          });
        });

        it("Should work if clientId", function() {
          new layer.UserIdentity({
            clientId: client.appId
          });
        });

        it("Should set a URL if none provided", function() {
          expect(new layer.UserIdentity({
            userId: "frodo",
            client: client
          }).url).toEqual(client.url + '/identities/frodo');
        });
      });

      describe("The _populateFromServer() method", function() {
        var identity;
        beforeEach(function() {
          identity = new layer.UserIdentity({
            client: client
          });
        });

        it("Should call _setSynced", function() {
          spyOn(identity, "_setSynced");
          identity._populateFromServer({
            displayName: "Frodo"
          });
          expect(identity._setSynced).toHaveBeenCalledWith();
        });

        it("Should update all properties", function() {
          identity._populateFromServer({
            display_name: "a",
            first_name: "b",
            last_name: "c",
            phone_number: "d",
            email_address: "e",
            metadata: {hey: "ho"},
            public_key: "h",
            user_id: "i",
            id: "layer:///identities/i"
          });
          expect(identity.displayName).toEqual("a");
          expect(identity.firstName).toEqual("b");
          expect(identity.lastName).toEqual("c");
          expect(identity.phoneNumber).toEqual("d");
          expect(identity.emailAddress).toEqual("e");
          expect(identity.metadata).toEqual({hey: "ho"});
          expect(identity.publicKey).toEqual("h");
          expect(identity.userId).toEqual("i");
        });

        it("Should trigger change events for changed properties", function() {
          identity.lastName = "c";
          identity.emailAddress = "e";
          spyOn(identity, "_triggerAsync");
          identity._populateFromServer({
            display_name: "a",
            avatar_url: "z",
            first_name: "b",
            last_name: "c",
            phone_number: "d",
            email_address: "e",
            metadata: {hey: "ho"},
            public_key: "h",
            user_id: "i",
            id: "layer:///identities/i"
          });
          expect(identity._triggerAsync).toHaveBeenCalledWith("identities:change", {
            property: "displayName",
            oldValue: '',
            newValue: 'a'
          });
          expect(identity._triggerAsync).toHaveBeenCalledWith("identities:change", {
            property: "avatarUrl",
            oldValue: '',
            newValue: 'z'
          });
          expect(identity._triggerAsync).toHaveBeenCalledWith("identities:change", {
            property: "firstName",
            oldValue: '',
            newValue: 'b'
          });
          expect(identity._triggerAsync).toHaveBeenCalledWith("identities:change", {
            property: "phoneNumber",
            oldValue: '',
            newValue: 'd'
          });
          expect(identity._triggerAsync).toHaveBeenCalledWith("identities:change", {
            property: "metadata",
            oldValue: null,
            newValue: {hey: "ho"}
          });
          expect(identity._triggerAsync).toHaveBeenCalledWith("identities:change", {
            property: "publicKey",
            oldValue: '',
            newValue: 'h'
          });
          expect(identity._triggerAsync.calls.count()).toEqual(6);
        });

        it("Should call client._addIdentity", function() {
          spyOn(client, "_addIdentity");
          identity._populateFromServer({
            display_name: "a",
            first_name: "b",
            last_name: "c",
            phone_number: "d",
            email_address: "e",
            metadata: {hey: "ho"},
            public_key: "h",
            user_id: "i",
            id: "layer:///identities/i"
          });
          expect(client._addIdentity).toHaveBeenCalledWith(identity);
        });

        it("Should set isFullIdentity to true", function() {
          identity._populateFromServer({
            display_name: "a",
            first_name: "b",
            last_name: "c",
            phone_number: "d",
            email_address: "e",
            metadata: {hey: "ho"},
            public_key: "h",
            user_id: "i",
            id: "layer:///identities/i"
          });
          expect(identity.isFullIdentity).toBe(true);

        });

        it("Should set isFullIdentity to false", function() {
          identity._populateFromServer({
            display_name: "a",
            user_id: "i",
            id: "layer:///identities/i"
          });
          expect(identity.isFullIdentity).toBe(false);
        });

        it("Should load Identity from database if not fullIdentity", function() {
          getObjectsResult = [{
            display_name: "a",
            first_name: "b",
            last_name: "c",
            phone_number: "d",
            email_address: "e",
            metadata: {hey: "ho"},
            public_key: "h",
            user_id: "i",
            id: "layer:///identities/i"
          }];

          // Run
          identity._populateFromServer({
            display_name: "a",
            user_id: "i",
            id: "layer:///identities/i"
          });

          // Posttest
          jasmine.clock().tick(101);
          expect(client.dbManager.getObjects).toHaveBeenCalledWith('identities', [identity.id], jasmine.any(Function));
          expect(identity.isFullIdentity).toBe(true);
          expect(identity.metadata).toEqual({hey: "ho"});
        });

        it("Should not load Identity from database if already fullIdentity", function() {
          getObjectsResult = [{
            display_name: "a",
            first_name: "b",
            last_name: "c",
            phone_number: "d",
            email_address: "e",
            metadata: {hey: "ho"},
            public_key: "h",
            user_id: "i",
            id: "layer:///identities/i"
          }];
          jasmine.clock().tick(1000); // clear out any incomplete calls
          client.dbManager.getObjects.calls.reset();


          // Run
          identity._populateFromServer({
            display_name: "zzz",
            first_name: "b",
            last_name: "c",
            phone_number: "d",
            email_address: "e",
            metadata: {hey: "ho"},
            public_key: "h",
            user_id: "i",
            id: "layer:///identities/i"
          });

          // Posttest
          jasmine.clock().tick(101);
          expect(client.dbManager.getObjects).not.toHaveBeenCalled();
          expect(identity.displayName).toEqual("zzz");
        });
      });

      describe("The follow() method", function() {
        it("Should ignore the call if isFullIdentity", function() {
          spyOn(identity, "_xhr");
          identity.follow();
          expect(identity._xhr).not.toHaveBeenCalled();
        });

        it("Should send a request to the server if not isFullIdentity", function() {
          spyOn(basicIdentity, "_xhr");
          basicIdentity.follow();
          expect(basicIdentity._xhr).toHaveBeenCalledWith({
            method: "PUT",
            url: client.url + '/following/' + basicIdentity.userId,
            syncable: {}
          }, jasmine.any(Function));
        });

        it("Should call _load if successful", function() {
          basicIdentity.follow();
          spyOn(basicIdentity, "_load");
          requests.mostRecent().response({
              status: 204
          });
          expect(basicIdentity._load).toHaveBeenCalledWith();
        });
      });

      describe("The unfollow() method", function() {
        it("Should send a request to the server if not isFullIdentity", function() {
          spyOn(basicIdentity, "_xhr");
          basicIdentity.unfollow();
          expect(basicIdentity._xhr).toHaveBeenCalledWith({
            method: "DELETE",
            url: client.url + '/following/' + basicIdentity.userId,
            syncable: {}
          });
        });
      });

      describe("The _loaded() method", function() {
         it("Should call client._addIdentity", function() {
            spyOn(client, "_addIdentity");
            identity._loaded({});
            expect(client._addIdentity).toHaveBeenCalledWith(identity);
         });
      });

      describe("The _handleWebsocketDelete() method", function() {
        it("Should call dbManager.deleteObjects", function() {
          spyOn(client.dbManager, "deleteObjects");
          identity._handleWebsocketDelete(null);
          expect(client.dbManager.deleteObjects).toHaveBeenCalledWith('identities', [identity]);
        });

        it("Should clear out all fullIdentity fields", function() {
          identity._handleWebsocketDelete(null);
          expect(identity.firstName).toBe('');
          expect(identity.lastName).toBe('');
          expect(identity.emailAddress).toBe('');
          expect(identity.phoneNumber).toBe('');
          expect(identity.metadata).toBe(null);
          expect(identity.publicKey).toBe('');
          expect(identity.isFullIdentity).toBe(false);
        });

        it("Should trigger identities:unfollow", function() {
          spyOn(identity, '_triggerAsync');
          identity._handleWebsocketDelete(null);
          expect(identity._triggerAsync).toHaveBeenCalledWith('identities:unfollow');
        });
      });

      describe("The _createFromServer() method", function() {
        it("Should return a new UserIdentity", function() {
          expect(layer.UserIdentity._createFromServer(responses.useridentity, client)).toEqual(jasmine.any(layer.UserIdentity));
          expect(layer.UserIdentity._createFromServer(responses.useridentity, client).userId).toEqual(responses.useridentity.user_id);
        });
      });

      describe("The _setUserId() method", function() {
        it("Should update userId", function() {
          // Run
          client.user._setUserId('Frodo the Dodo');

          // Posttest
          expect(client.user.userId).toEqual('Frodo the Dodo');
        });

        it("Should update id", function() {
          // Run
          client.user._setUserId('Frodo the Dodo');

          // Posttest
          expect(client.user.id).toEqual('layer:///identities/Frodo%20the%20Dodo');
        });

        it("Should update url", function() {
          // Run
          client.user._setUserId('Frodo the Dodo');

          // Posttest
          expect(client.user.url).toEqual(client.url + '/identities/Frodo%20the%20Dodo');
        });

        it("Should update client._identitiesHash", function() {
          // Setup
          client._identitiesHash = {};
          client._identitiesHash[client.user.id] = client.user;

          // Run
          client.user._setUserId('Frodo the Dodo');

          // Posttest
          expect(client._identitiesHash).toEqual({
            'layer:///identities/Frodo%20the%20Dodo': client.user
          });
        });
      });

      xit("Should escape user ids", function() {
        expect(1).toBe(0);
      });
    });

    describe("The ServiceIdentity Class", function() {
      describe("The _populateFromServer() method", function() {
        it("Should set the name and displayName", function() {
          var identity = new layer.ServiceIdentity({
            client: client
          });
          identity._populateFromServer({
            id: "layer:///serviceidentities/Lord of Kite",
            name: "I am Zod"
          });
          expect(identity.name).toEqual("I am Zod");
          expect(identity.displayName).toEqual("I am Zod");
        });

        it("Should call client._addIdentity", function() {
          spyOn(client, "_addIdentity");
          var identity = new layer.ServiceIdentity({
            client: client
          });
          identity._populateFromServer(responses.serviceidentity);
          expect(client._addIdentity).toHaveBeenCalledWith(identity);
        });
      });
    });

    describe("The destroy() method", function() {
      it("Should call _removeIdentity", function() {
        spyOn(client, "_removeIdentity");
        identity.destroy();
        expect(client._removeIdentity).toHaveBeenCalledWith(identity);
      });

      it("Should call parent destroy", function() {
        var tmp = layer.Syncable.prototype.destroy;
        spyOn(layer.Syncable.prototype, "destroy");
        identity.destroy();
        expect(layer.Syncable.prototype.destroy).toHaveBeenCalledWith();

        // Restore
        layer.Syncable.prototype.destroy = tmp;
      });
    });
});
