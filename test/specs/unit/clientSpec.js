/*eslint-disable */
// TODO: All tests should be run with both isTrustedDevice = true and false
describe("The Client class", function() {
    var appId = "Fred's App";
    var userId = "93c83ec4-b508-4a60-8550-099f9c42ec1a";
    var identityToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImN0eSI6ImxheWVyLWVpdDt2PTEiLCJraWQiOiIyOWUzN2ZhZS02MDdlLTExZTQtYTQ2OS00MTBiMDAwMDAyZjgifQ.eyJpc3MiOiI4YmY1MTQ2MC02MDY5LTExZTQtODhkYi00MTBiMDAwMDAwZTYiLCJwcm4iOiI5M2M4M2VjNC1iNTA4LTRhNjAtODU1MC0wOTlmOWM0MmVjMWEiLCJpYXQiOjE0MTcwMjU0NTQsImV4cCI6MTQxODIzNTA1NCwibmNlIjoiRFZPVFZzcDk0ZU9lNUNzZDdmaWVlWFBvUXB3RDl5SjRpQ0EvVHJSMUVJT25BSEdTcE5Mcno0Yk9YbEN2VDVkWVdEdy9zU1EreVBkZmEydVlBekgrNmc9PSJ9.LlylqnfgK5nhn6KEsitJMsjfayvAJUfAb33wuoCaNChsiRXRtT4Ws_mYHlgwofVGIXKYrRf4be9Cw1qBKNmrxr0er5a8fxIN92kbL-DlRAAg32clfZ_MxOfblze0DHszvjWBrI7F-cqs3irRi5NbrSQxeLZIiGQdBCn8Qn5Zv9s";
    var cid1 = "layer:///conversations/test1",
        cid2 = "layer:///conversations/test2",
        cid3 = "layer:///conversations/test3",
        url1 = "https://huh.com/conversations/test1",
        url2 = "https://huh.com/conversations/test2",
        url3 = "https://huh.com/conversations/test3";
    var client, requests;

    beforeEach(function() {
        jasmine.clock().install();
        jasmine.Ajax.install();
        requests = jasmine.Ajax.requests;
        jasmine.addCustomEqualityTester(mostRecentEqualityTest);
        jasmine.addCustomEqualityTester(responseTest);

        client = new layer.Client({
            appId: appId,
            url: "https://huh.com"
        });
        client.sessionToken = "sessionToken";
        client.userId = "Frodo";
        client.isReady = true;
    });

    afterEach(function() {
        jasmine.clock().uninstall();
        jasmine.Ajax.uninstall();
    });

    afterAll(function() {
        layer.Client.destroyAllClients();
    });

    describe("The constructor() method", function() {
        it("Should register the Client", function() {
            var client = new layer.Client({
                appId: "Samunwise",
                url: "https://huh.com"
            });
            expect(layer.Client.getClient("Samunwise")).toBe(client);
        });

        it("Should initialize all caches", function() {
            expect(client._messagesHash).toEqual({});
            expect(client._conversationsHash).toEqual({});
            expect(client._queriesHash).toEqual({});
            expect(client._identitiesHash).toEqual({});
            expect(client._serviceIdentitiesHash).toEqual({});
            expect(client._scheduleCheckAndPurgeCacheItems).toEqual([]);
        });


        it("Should call _initComponents", function() {
            expect(client.syncManager).toEqual(jasmine.any(layer.SyncManager));
        });

        it("Should call _connectionRestored on receiving an online event", function() {
            var _connectionRestored =  layer.Client.prototype._connectionRestored;
            spyOn(layer.Client.prototype, "_connectionRestored");
            var client = new layer.Client({
                appId: "Samunwise",
                url: "https://huh.com"
            });
            expect(client._connectionRestored).not.toHaveBeenCalled();

            // Run
            client.trigger("online");

            // Posttest
            expect(client._connectionRestored).toHaveBeenCalled();

            // Restore
            layer.Client.prototype._connectionRestored = _connectionRestored;
        });
    });

    describe("The _initComponents() method", function() {
        it("Should setup the TypingListenerIndicator", function() {
            client._initComponents();
            expect(client._typingIndicators).toEqual(jasmine.any(layer.Root));
        });

        xit("Should have a test for plugins", function() {

        });
    });

    describe("The _cleanup() method", function() {
        afterEach(function() {
            client._messagesHash = client._conversationsHash = client._queriesHash = client._identitiesHash = client._serviceIdentitiesHash = {};
        });

        it("Should destroy all Messages", function() {
            // Setup
            var conversation = client.createConversation(["a"]);
            var message = conversation.createMessage("Hi").send();
            conversation.lastMessage = null;
            message.conversationId = "c1";

            // Pretest
            expect(client._messagesHash[message.id]).toBe(message);

            // Run
            client._cleanup();

            // Posttest
            expect(message.isDestroyed).toBe(true);
            expect(client._messagesHash).toBe(null);
        });

        it("Should destroy all Conversations", function() {
            // Setup
            var conversation = client.createConversation(["a"]);

            // Pretest
            expect(client._conversationsHash[conversation.id]).toBe(conversation);

            // Run
            client._cleanup();

            // Posttest
            expect(conversation.isDestroyed).toBe(true);
            expect(client._conversationsHash).toBe(null);

        });

        it("Should destroy all Queries", function() {
            // Setup
            client._clientAuthenticated();
            client._clientReady();
            var query = client.createQuery({});

            // Pretest
            expect(client._queriesHash[query.id]).toBe(query);

            // Run
            client._cleanup();

            // Posttest
            expect(query.isDestroyed).toBe(true);
            expect(client._queriesHash).toBe(null);
        });

        it("Should destroy all Identities", function() {
            // Setup
            client._clientAuthenticated();
            client._clientReady();
            var userIdentity = new layer.UserIdentity({
                clientId: client.appId,
                id: "layer:///identities/1",
                displayName: "UserIdentity"
            });
            var serviceIdentity = new layer.ServiceIdentity({
                clientId: client.appId,
                id: "layer:///serviceidentities/2",
                name: "ServiceIdentity"
            });
            client._identitiesHash[userIdentity.id] = userIdentity;
            client._serviceIdentitiesHash[serviceIdentity.id] = serviceIdentity;

            // Run
            client._cleanup();

            // Posttest
            expect(userIdentity.isDestroyed).toBe(true);
            expect(serviceIdentity.isDestroyed).toBe(true);
            expect(client._identitiesHash).toBe(null);
            expect(client._serviceIdentitiesHash).toBe(null);
        });

        it("Should close the websocket", function() {
            spyOn(client.socketManager, "close");
            client._cleanup();
            expect(client.socketManager.close).toHaveBeenCalled();
        });

        it("Should do nothing if destroyed", function() {
            client.isDestroyed = true;
            client._cleanup();
            expect(client._conversationsHash).toEqual({});
            client.isDestroyed = false;
        });
    });

    describe("The _clientReady() method", function() {
       var superClientReady;
       beforeEach(function() {
           superClientReady = layer.ClientAuthenticator.prototype._clientReady;
           spyOn(layer.ClientAuthenticator.prototype, "_clientReady");
           client.isTrustedDevice = true;
           client._clientAuthenticated();
           spyOn(client.dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
               callback([]);
           });
       });
       afterEach(function() {
           layer.ClientAuthenticator.prototype._clientReady = superClientReady;
       });

       it("Should not call super._clientReady if there is no user", function() {
            client._clientAuthenticated();
            client._clientReady();
            expect(layer.ClientAuthenticator.prototype._clientReady).not.toHaveBeenCalled();
       });

       it("Should not call super._clientReady if there a user but not loaded yet", function() {
           client.user = new layer.UserIdentity({
               userId: "Frodo1",
               displayName: "Frodo2",
               syncState: layer.Constants.SYNC_STATE.LOADING,
               clientId: client.appId,

           });
           client._clientReady();
           expect(layer.ClientAuthenticator.prototype._clientReady).not.toHaveBeenCalled();
       });

       it("Should set the user and load it", function() {
           expect(client.user).toBe(null);
           client._clientReady();
           expect(client.user).toEqual(jasmine.any(layer.UserIdentity));
           expect(client.user.syncState).toEqual(layer.Constants.SYNC_STATE.LOADING);
           expect(requests.mostRecent().url).toEqual(client.url + "/identities/Frodo");
       });

       it("Should call super._clientReady when its loaded", function() {
           client._clientReady();
           client.user.syncState = layer.Constants.SYNC_STATE.SYNCED;
           client.user.trigger('identities:loaded');

           expect(layer.ClientAuthenticator.prototype._clientReady).toHaveBeenCalledWith();
       });

       it("Should call super._clientReady if its already loaded", function() {
           client.user = new layer.UserIdentity({
               userId: "Frodo1",
               displayName: "Frodo2",
               syncState: layer.Constants.SYNC_STATE.SYNCED,
               clientId: client.appId,
           });
           client._clientReady();
           expect(layer.ClientAuthenticator.prototype._clientReady).toHaveBeenCalledWith();
       });

       it("Should retry on identities:loaded-error", function() {
           // Setup
           client._clientReady();
           expect(layer.ClientAuthenticator.prototype._clientReady).not.toHaveBeenCalled();
           spyOn(client, "_clientReady");

           // Run
           client.user.trigger('identities:loaded-error');
           expect(layer.ClientAuthenticator.prototype._clientReady).not.toHaveBeenCalled();
           jasmine.clock().tick(2001);

           // Posttest
           expect(client._clientReady).toHaveBeenCalledWith();
       });
    });

    describe("The destroy() method", function() {
        afterEach(function() {
            client = null;
        });
        it("Should call _cleanup", function() {
            spyOn(client, "_cleanup");
            client.destroy();
            expect(client._cleanup).toHaveBeenCalledWith();
        });

        it("Should call _destroyComponents", function() {
            spyOn(client, "_destroyComponents");
            client.destroy();
            expect(client._destroyComponents).toHaveBeenCalledWith();
        });

        it("Should unregister the client", function() {
            var appId = client.appId;
            expect(layer.Client.getClient(appId)).toBe(client);
            client.destroy();
            expect(layer.Client.getClient(appId)).toBe(undefined);
        });
    });

    describe("Methods that require clientReady", function() {
        beforeEach(function() {
            client.isTrustedDevice = true;
            client._clientAuthenticated();
            spyOn(client.dbManager, "getObjects").and.callFake(function(tableName, ids, callback) {
               callback([]);
            });
            client._clientReady();

        });

        describe("The getConversation() method", function() {
            var conversation;
            beforeEach(function() {
                conversation = new layer.Conversation({
                    client: client,
                    fromServer: {
                        id: "layer:///conversations/ " + layer.Util.generateUUID(),
                        participants: ["a"]
                    }
                });
            });
            it("Should get by id", function() {
                expect(client.getConversation(conversation.id)).toBe(conversation);
            });

            it("Should load by id", function() {
                var c1 = client.getConversation(cid1, true);

                // Posttest
                expect(c1 instanceof layer.Conversation).toBe(true);
                expect(c1.participants).toEqual([client.userId]);
                expect(c1.id).toEqual(cid1);
                expect(requests.mostRecent().url).toEqual(url1);
            });

            it("Should fail without id", function() {
                expect(function() {
                    client.getConversation(5);
                }).toThrowError(layer.LayerError.dictionary.idParamRequired);
                expect(layer.LayerError.dictionary.idParamRequired.length > 0).toBe(true);
            });
        });

        describe("The _addConversation() method", function() {


            it("Should register a conversation in _conversationsHash", function() {
                client._conversationsHash = {};
                var c = new layer.Conversation({});

                // Run
                client._addConversation(c);

                // Posttest
                expect(client.getConversation(c.id)).toBe(c);
            });

            it("Should set the clientId property", function() {
                // Setup
                var c = new layer.Conversation({});

                // Pretest
                expect(c.clientId).toEqual("");

                // Run
                client._addConversation(c);

                // Posttest
                expect(c.clientId).toEqual(client.appId);
            });

            it("Should fire conversations:add", function() {
                // Setup
                spyOn(client, "_triggerAsync");

                // Run
                var c = new layer.Conversation({
                });
                client._addConversation(c);

                // Posttest
                expect(client._triggerAsync)
                .toHaveBeenCalledWith("conversations:add", {conversations: [c]});
            });

            it("Should not do anything if the conversation is already added", function() {
                // Setup
                var c = new layer.Conversation({});
                client._addConversation(c);
                spyOn(client, "_triggerAsync");


                // Run
                var c2 = new layer.Conversation({
                    id: c.id
                });
                client._addConversation(c2);

                // Posttest
                expect(client.getConversation(c.id)).toBe(c);
                expect(client._triggerAsync).not.toHaveBeenCalled();
            });

            it("Should call _scheduleCheckAndPurgeCache", function() {
                spyOn(client, "_scheduleCheckAndPurgeCache");

                // Run
                var c = new layer.Conversation({});
                client._addConversation(c);

                // Posttest
                expect(client._scheduleCheckAndPurgeCache).toHaveBeenCalledWith(c);
            });
        });

        describe("The _removeConversation() method", function() {

            it("Should deregister a conversation", function() {
                // Setup
                var c1 = client.createConversation(["a"]);

                // Pretest
                var hash = {};
                hash[c1.id] = c1;
                expect(client._conversationsHash).toEqual(hash);

                // Run
                client._removeConversation(c1);

                // Posttest
                delete hash[c1.id];
                expect(client._conversationsHash).toEqual(hash);
            });

            it("Should trigger event on removing conversation", function() {
                // Setup
                var c1 = new layer.Conversation({});
                client._addConversation(c1);
                spyOn(client, "_triggerAsync");

                // Run
                client._removeConversation(c1);

                // Posttest
                expect(client._triggerAsync).toHaveBeenCalledWith(
                    "conversations:remove", {
                        conversations: [c1]
                    }
                );
            });


            it("Should do nothing if conversation not registered", function() {
                // Setup
                var c1 = new layer.Conversation({});
                spyOn(client, "trigger");

                // Pretest
                expect(client.getConversation(c1.id)).toEqual(null);

                // Run
                client._removeConversation(c1);

                // Posttest
                expect(client.trigger).not.toHaveBeenCalled();
            });

            it("Should destroy any Messages associated with the Conversation", function() {
                // Setup
                var c1 = client.createConversation(["a"]);
                var m1 = c1.createMessage("a").send();
                var m2 = c1.createMessage("b").send();
                var m3 = c1.createMessage("c").send();
                var c2 = client.createConversation(["b"]);
                var m4 = c2.createMessage("a").send();

                // Pretest
                expect(Object.keys(client._messagesHash))
                    .toEqual(jasmine.arrayContaining([m1.id, m2.id, m3.id, m4.id]));

                // Run
                client._removeConversation(c1);

                // Posttest
                expect(Object.keys(client._messagesHash)).toEqual(jasmine.arrayContaining([m4.id]));
            });
        });

        describe("The _updateConversationId() method", function() {
            it("Should register the conversation under the new id", function() {
                // Setup
                var c1 = new layer.Conversation({});
                client._addConversation(c1);
                var c1id = c1.id;

                // Run
                c1.id = "fred";
                client._updateConversationId(c1, c1id);

                // Posttest
                expect(client.getConversation("fred")).toBe(c1);
            });

            it("Should delete the old id", function() {
                // Setup
                var c1 = new layer.Conversation({});
                client._addConversation(c1);
                var c1id = c1.id;

                // Pretest
                expect(client.getConversation(c1id)).toBe(c1);

                // Run
                c1.id = "fred";
                client._updateConversationId(c1, c1id);

                // Posttest
                expect(client._conversationsHash[c1id]).toBe(undefined);
            });

            it("Should update all Message conversationIds", function() {
                // Setup
                var c1 = new layer.Conversation({participants: ["a"]});
                client._addConversation(c1);
                var m1 = c1.createMessage("Hey").send();
                var m2 = c1.createMessage("Ho").send();
                var c1id = c1.id;

                // Pretest
                expect(m1.conversationId).toEqual(c1id);
                expect(m2.conversationId).toEqual(c1id);

                // Run
                c1.id = "fred";
                client._updateConversationId(c1, c1id);

                // Posttest
                expect(m1.conversationId).toEqual("fred");
                expect(m2.conversationId).toEqual("fred");
            });

        });

        describe("The getMessagePart() method", function() {
            var conversation;
            var message;
            beforeEach(function() {
                conversation = client.createConversation(["a"]);
                message = new layer.Message({
                    client: client,
                    fromServer: responses.message1,
                });
            });

            it("Should get by id", function() {
                expect(client.getMessagePart(responses.message1.parts[1].id)).toBe(message.parts[1]);
            });

            it("Should fail by id", function() {
                expect(client.getMessagePart(responses.message1.parts[1].id + "1")).toBe(undefined);
            });
        });


        describe("The getMessage() method", function() {
            var conversation;
            var message;
            beforeEach(function() {
                conversation = client.createConversation(["a"]);
                message = conversation.createMessage("hello").send();
            });

            it("Should get by id", function() {
                expect(client.getMessage(message.id)).toBe(message);
            });

            it("Should load Message by id", function() {
                var newId = message.id + "a";
                var m1 = client.getMessage(newId, true);

                // Posttest
                expect(m1 instanceof layer.Message).toBe(true);
                expect(m1.id).toEqual(newId);
                expect(requests.mostRecent().url).toEqual(client.url + newId.replace(/layer\:\/\//,""));
            });

            it("Should load Announcement by id", function() {
                var newId = message.id.replace(/messages/, 'announcements');
                var m1 = client.getMessage(newId, true);

                // Posttest
                expect(m1 instanceof layer.Announcement).toBe(true);
                expect(m1.id).toEqual(newId);
                expect(requests.mostRecent().url).toEqual(client.url + newId.replace(/layer\:\/\//,""));
            });

            it("Should fail without id", function() {
                expect(function() {
                    client.getMessage(5);
                }).toThrowError(layer.LayerError.dictionary.idParamRequired);
                expect(layer.LayerError.dictionary.idParamRequired.length > 0).toBe(true);
            });
        });

        describe("The _addMessage() method", function() {
            var conversation;
            var message;
            beforeEach(function() {
                conversation = client.createConversation(["a"]);
                message = conversation.createMessage("hello").send();
            });

            it("Should register a Message in _messagesHash", function() {
                // Setup
                client._messagesHash = {};

                // Run
                client._addMessage(message);

                // Posttest
                expect(client.getMessage(message.id)).toBe(message);
            });

            it("Should fire messages:add", function() {
                // Setup
                spyOn(client, "_triggerAsync");
                client._messagesHash = {};

                // Run
                client._addMessage(message);

                // Posttest
                expect(client._triggerAsync)
                .toHaveBeenCalledWith("messages:add", {messages: [message]});
            });

            it("Should not do anything if the Message is already added", function() {
                // Setup
                var m = conversation.createMessage("b").send();
                m.id = message.id;
                spyOn(client, "_triggerAsync");

                // Run
                client._addMessage(m);

                // Posttest
                expect(client.getMessage(m.id)).toBe(message);
                expect(client._triggerAsync).not.toHaveBeenCalled();
            });

            it("Should update conversation lastMessage if position is greater than last Position", function() {
            // Setup
            conversation.lastMessage = conversation.createMessage("Hey");
            message.position = 10;
            client._messagesHash = {};


            // Run
            client._addMessage(message);

            // Posttest
            expect(conversation.lastMessage).toBe(message);
        });

        it("Should update conversation lastMessage if no lastMessage", function() {
            // Setup
            conversation.lastMessage = null;
            client._messagesHash = {};

            // Run
            client._addMessage(message);

            // Posttest
            expect(conversation.lastMessage).toBe(message);
        });

        it("Should call _scheduleCheckAndPurgeCache if no Conversation found", function() {
                spyOn(client, "_scheduleCheckAndPurgeCache");
                message.conversationId = '';
                client._messagesHash = {};

                // Run
                client._addMessage(message);

                // Posttest
                expect(client._scheduleCheckAndPurgeCache).toHaveBeenCalledWith(message);
            });

            it("Should not call _scheduleCheckAndPurgeCache if Conversation found and no lastMessage", function() {
                spyOn(client, "_scheduleCheckAndPurgeCache");
                client._messagesHash = {};
                var c = message.getConversation();
                c.lastMessage = null;

                // Run
                client._addMessage(message);

                // Posttest
                expect(client._scheduleCheckAndPurgeCache).not.toHaveBeenCalled();
            });

            it("Should call _scheduleCheckAndPurgeCache on prior lastMessage", function() {
                spyOn(client, "_scheduleCheckAndPurgeCache");
                var lastMessage = conversation.lastMessage;
                lastMessage.position = 1;

                client._messagesHash = {};
                client._messagesHash[lastMessage.id] = lastMessage;
                var m = conversation.createMessage("Hi");
                m.position = 2;

                // Run
                client._addMessage(m);

                // Posttest
                expect(client._scheduleCheckAndPurgeCache).toHaveBeenCalledWith(lastMessage);
            });

            it("Should not call _scheduleCheckAndPurgeCache if no lastMessage", function() {
                spyOn(client, "_scheduleCheckAndPurgeCache");
                conversation.lastMessage = null;
                client._messagesHash = {};

                // Run
                client._addMessage(message);

                // Posttest
                expect(client._scheduleCheckAndPurgeCache).not.toHaveBeenCalled();
            });
        });

        describe("The _removeMessage() method", function() {
            var conversation;
            var message;
            beforeEach(function() {
                conversation = client.createConversation(["a"]);
                message = conversation.createMessage("hello").send();
            });

            it("Should deregister a Message", function() {
                // Pretest
                var hash = {};
                hash[message.id] = message;
                expect(client._messagesHash).toEqual(hash);

                // Run
                client._removeMessage(message);

                // Posttest
                expect(client._messagesHash).toEqual({});
            });

            it("Should trigger event on removing Message", function() {
                // Setup
                spyOn(client, "_triggerAsync");

                // Run
                client._removeMessage(message);

                // Posttest
                expect(client._triggerAsync).toHaveBeenCalledWith(
                    "messages:remove", {
                        messages: [message]
                    }
                );
            });


            it("Should do nothing if Message not registered", function() {
                // Setup
                var m = conversation.createMessage("h").send();
                delete client._messagesHash[m.id];
                spyOn(client, "trigger");

                // Pretest
                expect(client.getMessage(m.id)).toEqual(null);

                // Run
                client._removeMessage(m);

                // Posttest
                expect(client.trigger).not.toHaveBeenCalled();
            });
        });

        describe("The _addIdentity() method", function() {
            it("Should not add a UserIdentity that already exists", function() {
                // Setup
                var userIdentity = new layer.UserIdentity({
                    clientId: client.appId,
                    id: "layer:///identities/1",
                    displayName: "UserIdentity"
                });
                client._identitiesHash[userIdentity.id] = userIdentity;
                var userIdentity2 = new layer.UserIdentity({
                    clientId: client.appId,
                    id: "layer:///identities/1",
                    displayName: "UserIdentity"
                });
                expect(userIdentity).not.toBe(userIdentity2);

                // Run
                client._addIdentity(userIdentity2);

                // Posttest
                expect(client._identitiesHash).toEqual({"layer:///identities/1": userIdentity});
            });

            it("Should add a UserIdentity and trigger identities:add", function() {
                // Setup
                var userIdentity = new layer.UserIdentity({
                    clientId: client.appId,
                    id: "layer:///identities/1",
                    displayName: "UserIdentity"
                });
                expect(client._identitiesHash).toEqual({});
                spyOn(client, "_triggerAsync");

                // Run
                client._addIdentity(userIdentity);

                // Posttest
                expect(client._identitiesHash).toEqual({"layer:///identities/1": userIdentity});
                expect(client._triggerAsync).toHaveBeenCalledWith('identities:add', {identities: [userIdentity]});
            });

            it("Should not add a ServiceIdentity that already exists", function() {
                var serviceIdentity = new layer.ServiceIdentity({
                    clientId: client.appId,
                    id: "layer:///serviceidentities/2",
                    name: "ServiceIdentity"
                });
                client._serviceIdentitiesHash[serviceIdentity.id] = serviceIdentity;
                var serviceIdentity2 = new layer.ServiceIdentity({
                    clientId: client.appId,
                    id: "layer:///serviceidentities/2",
                    name: "ServiceIdentity"
                });
                expect(client._serviceIdentitiesHash).toEqual({"layer:///serviceidentities/2": serviceIdentity});
                expect(serviceIdentity).not.toBe(serviceIdentity2);

                // Run
                client._addIdentity(serviceIdentity2);

                // Posttest
                expect(client._serviceIdentitiesHash).toEqual({"layer:///serviceidentities/2": serviceIdentity});
            });

            it("Should add a ServiceIdentity but NOT trigger any events", function() {
                var serviceIdentity = new layer.ServiceIdentity({
                    clientId: client.appId,
                    id: "layer:///serviceidentities/2",
                    name: "ServiceIdentity"
                });
                expect(client._serviceIdentitiesHash).toEqual({});
                spyOn(client, "_triggerAsync");

                // Run
                client._addIdentity(serviceIdentity);

                // Posttest
                expect(client._serviceIdentitiesHash).toEqual({"layer:///serviceidentities/2": serviceIdentity});
                expect(client._triggerAsync).not.toHaveBeenCalled();
            });

        });

        describe("The _removeIdentity() method", function() {
            var userIdentity, serviceIdentity;
            beforeEach(function() {
                userIdentity = new layer.UserIdentity({
                    clientId: client.appId,
                    id: "layer:///identities/1",
                    displayName: "UserIdentity"
                });
                serviceIdentity = new layer.ServiceIdentity({
                    clientId: client.appId,
                    id: "layer:///serviceidentities/2",
                    name: "ServiceIdentity"
                });
                client._identitiesHash = {"layer:///identities/1": userIdentity};
                client._serviceIdentitiesHash = {"layer:///serviceidentities/2": serviceIdentity};
            });

            it("Should ignore irrelevant ID prefixes", function() {
                expect(function() {
                    client._removeIdentity(new layer.UserIdentity({
                        id: "layer:///mountains/2",
                        clientId: client.appId
                    }));
                }).not.toThrow();
            });

            it("Should ignore IDS not cached", function() {
                client._removeIdentity(new layer.UserIdentity({
                    id: "layer:///identities/fooled-you",
                    clientId: client.appId
                }));
                client._removeIdentity(new layer.UserIdentity({
                    id: "layer:///serviceidentities/fooled-you",
                    clientId: client.appId
                }));
                expect(client._identitiesHash).toEqual({"layer:///identities/1": userIdentity});
                expect(client._serviceIdentitiesHash).toEqual({"layer:///serviceidentities/2": serviceIdentity});
            });

            it("Should remove UserIdentity and trigger identities:remove", function() {
                spyOn(client, "_triggerAsync");
                client._removeIdentity(userIdentity);
                expect(client._identitiesHash).toEqual({});
                expect(client._triggerAsync).toHaveBeenCalledWith('identities:remove', {identities: [userIdentity]});
            });

            it("Should remove ServiceIdentity and not trigger events", function() {
                spyOn(client, "_triggerAsync");
                client._removeIdentity(serviceIdentity);
                expect(client._serviceIdentitiesHash).toEqual({});
                expect(client._triggerAsync).not.toHaveBeenCalled();
            });
        });

        describe("The getIdentity() method", function() {
            var userIdentity, serviceIdentity;
            beforeEach(function() {
                userIdentity = new layer.UserIdentity({
                    clientId: client.appId,
                    id: "layer:///identities/1",
                    userId: "1",
                    displayName: "UserIdentity"
                });
                serviceIdentity = new layer.ServiceIdentity({
                    clientId: client.appId,
                    id: "layer:///serviceidentities/2",
                    name: "ServiceIdentity"
                });
                client._identitiesHash = {"layer:///identities/1": userIdentity};
                client._serviceIdentitiesHash = {"layer:///serviceidentities/2": serviceIdentity};
            });

            it("Should get the user by ID", function() {
                expect(client.getIdentity(userIdentity.id)).toBe(userIdentity);
            });

            it("Should get the user by UserID", function() {
                expect(client.getIdentity(userIdentity.userId)).toBe(userIdentity);
            });

            it("Should get the ServiceIdentity by ID", function() {
                expect(client.getIdentity(serviceIdentity.id)).toBe(serviceIdentity);
            });

            it("Should load the identity if canLoad was used", function() {
                var identity = client.getIdentity('222', true);
                expect(requests.mostRecent().url).toEqual(client.url + '/identities/222');
                expect(identity.syncState).toEqual(layer.Constants.SYNC_STATE.LOADING);
            });
        });

        describe("The followIdentity() method", function() {
            it("Should call follow() on an existing Identity", function() {
                var userIdentity = new layer.UserIdentity({
                    clientId: client.appId,
                    id: "layer:///identities/1",
                    userId: "1",
                    displayName: "UserIdentity"
                });
                client._identitiesHash[userIdentity.id] = userIdentity;
                spyOn(userIdentity, "follow");

                // Run
                var result1 = client.followIdentity(userIdentity.userId);
                var result2 = client.followIdentity(userIdentity.id);

                // Posttest
                expect(userIdentity.follow.calls.count()).toEqual(2);
                expect(result1).toBe(userIdentity);
                expect(result2).toBe(userIdentity);
            });

            it("Should call follow() on a new Identity", function() {
                var tmp = layer.UserIdentity.prototype.follow;
                spyOn(layer.UserIdentity.prototype, "follow");

                // Run
                var result1 = client.followIdentity("1");

                // Posttest
                expect(layer.UserIdentity.prototype.follow.calls.count()).toEqual(1);
                expect(result1.id).toEqual("layer:///identities/1");
            });
        });

        describe("The unfollowIdentity() method", function() {
            it("Should call unfollow() on an existing Identity", function() {
                var userIdentity = new layer.UserIdentity({
                    clientId: client.appId,
                    id: "layer:///identities/1",
                    userId: "1",
                    displayName: "UserIdentity"
                });
                client._identitiesHash[userIdentity.id] = userIdentity;
                spyOn(userIdentity, "unfollow");

                // Run
                var result1 = client.unfollowIdentity(userIdentity.userId);
                var result2 = client.unfollowIdentity(userIdentity.id);

                // Posttest
                expect(userIdentity.unfollow.calls.count()).toEqual(2);
                expect(result1).toBe(userIdentity);
                expect(result2).toBe(userIdentity);
            });

            it("Should call unfollow() on a new Identity", function() {
                var tmp = layer.UserIdentity.prototype.unfollow;
                spyOn(layer.UserIdentity.prototype, "unfollow");

                // Run
                var result1 = client.unfollowIdentity("1");

                // Posttest
                expect(layer.UserIdentity.prototype.unfollow.calls.count()).toEqual(1);
                expect(result1.id).toEqual("layer:///identities/1");
            });

        });

        describe("The _purgeMessagesByPosition() method", function() {
        var m1, m2, m3, m4, conversation;

        beforeEach(function() {
                conversation = client.createConversation(["a"]);
                var c2 = client.createConversation(["b"]);
                m1 = conversation.createMessage("hello").send();
                m2 = conversation.createMessage("hello").send();
                m3 = conversation.createMessage("hello").send();
                m4 = c2.createMessage("hello").send();

                m1.position = 5;
                m2.position = 6;
                m3.position = 7;
                m4.position = 1;
                client._purgeMessagesByPosition(conversation.id, 6);
            });

        it("Should remove messages in the Conversation", function() {
            expect(m1.isDestroyed).toBe(true);
            expect(m2.isDestroyed).toBe(true);
        });

        it("Should leave messages not in the Conversation", function() {
            expect(m3.isDestroyed).toBe(false);
        });

        it("Should leave messages whose position is greater than fromPosition", function() {
            expect(m4.isDestroyed).toBe(false);
        });
        });

        describe("The _getObject() method", function() {
            var message, announcement, conversation, query, userIdentity, serviceIdentity;
            beforeEach(function() {
                client._clientReady();
                conversation = client.createConversation(["a"]);
                message = conversation.createMessage("hey").send();
                announcement = new layer.Announcement({
                client: client,
                parts: "Hey Ho"
                });
                client._addMessage(announcement);
                query = client.createQuery({
                    model: "Conversation"
                });
                userIdentity = client._createObject(JSON.parse(JSON.stringify(responses.useridentity)));
                serviceIdentity = client._createObject({
                    id: "layer:///serviceidentities/2",
                    name: "ServiceIdentity"
                });
            });

            // This test validates our inital state before running tests,
            // and is not a unit test.
            it("Should have suitable initial states", function() {
                var cHash = {},
                    mHash = {},
                    qHash = {},
                    identHash = {},
                    serviceIdentHash = {};
                cHash[conversation.id] = conversation;
                mHash[message.id] = message;
                mHash[announcement.id] = announcement;
                qHash[query.id] = query;
                identHash[userIdentity.id] = userIdentity;
                serviceIdentHash[serviceIdentity.id] = serviceIdentity;

                expect(client._conversationsHash).toEqual(cHash);
                expect(client._messagesHash).toEqual(mHash);
                expect(client._queriesHash).toEqual(qHash);
                expect(client._identitiesHash).toEqual(identHash);
                expect(client._serviceIdentitiesHash).toEqual(serviceIdentHash);
            });

            it("Should get a Conversation", function() {
                expect(client._getObject(conversation.id)).toBe(conversation);
            });

            it("Should not get a Conversation", function() {
                expect(client._getObject(conversation.id + "a")).toBe(null);
            });

            it("Should get a Message", function() {
                expect(client._getObject(message.id)).toBe(message);
            });

            it("Should not get a Message", function() {
                expect(client._getObject(message.id + "a")).toBe(null);
            });

            it("Should get an Announcement", function() {
                expect(client._getObject(announcement.id)).toBe(announcement);
            });

            it("Should not get an Announcement", function() {
                expect(client._getObject(announcement.id + "a")).toBe(null);
            });

            it("Should get a Query", function() {
                expect(client._getObject(query.id)).toBe(query);
            });

            it("Should not get a Query", function() {
                expect(client._getObject(query.id + "a")).toBe(null);
            });

            it("Should get a UserIdentity", function() {
                expect(client._getObject(userIdentity.id)).toBe(userIdentity);
            });

            it("Should not get a UserIdentity", function() {
                expect(client._getObject(userIdentity.id + "a")).toBe(null);
            });

            it("Should get a ServiceIdentity", function() {
                expect(client._getObject(serviceIdentity.id)).toBe(serviceIdentity);
            });

            it("Should not get a ServiceIdentity", function() {
                expect(client._getObject(serviceIdentity.id + "a")).toBe(null);
            });

            it("Should not get a non-layer-object", function() {
                expect(client._getObject("Hey")).toBe(null);
            });
        });

        describe("The _createObject() method", function() {
            it("Should call _populateFromServer if found", function() {
            // Setup
            var m = client.createConversation(["a"]).createMessage("a").send();
            spyOn(m, "_populateFromServer");

            // Pretest
            expect(client.getMessage(m.id)).toBe(m);

            // Run
            var result = client._createObject(m.toObject());

            // Posttest
            expect(result).toBe(m);
            expect(m._populateFromServer).toHaveBeenCalledWith(m.toObject());
            });

            it("Should call Message._createFromServer", function() {
                // Setup
                var tmp = layer.Message._createFromServer;
                var m = client.createConversation(["a"]).createMessage("a").send();
                spyOn(layer.Message, "_createFromServer").and.returnValue(m);
                var messageObj = JSON.parse(JSON.stringify(responses.message1));

                // Run
                var message = client._createObject(messageObj);

                // Posttest
                expect(message).toBe(m);
                expect(layer.Message._createFromServer).toHaveBeenCalledWith(messageObj, client);

                // Restore
                layer.Message._createFromServer = tmp;
            });

            it("Should call Announcement._createFromServer", function() {
                // Setup
                var tmp = layer.Announcement._createFromServer;
                var announcement = new layer.Announcement({
                client: client,
                fromServer: JSON.parse(JSON.stringify(responses.announcement))
                });
                delete client._messagesHash[announcement.id];
                spyOn(layer.Announcement, "_createFromServer").and.returnValue(announcement);
                var messageObj = JSON.parse(JSON.stringify(responses.announcement));

                // Run
                var message = client._createObject(messageObj);

                // Posttest
                expect(message).toBe(announcement);
                expect(layer.Announcement._createFromServer).toHaveBeenCalledWith(messageObj, client);

                // Restore
                layer.Announcement._createFromServer = tmp;
            });

            it("Should call Conversation._createFromServer", function() {
                // Setup
                var tmp = layer.Conversation._createFromServer;
                var c = new layer.Conversation({});
                spyOn(layer.Conversation, "_createFromServer").and.returnValue(c);
                var conversationObj = JSON.parse(JSON.stringify(responses.conversation1));

                // Run
                var conversation = client._createObject(conversationObj);

                // Posttest
                expect(conversation).toBe(c);
                expect(layer.Conversation._createFromServer).toHaveBeenCalledWith(conversationObj, client);

                // Restore
                layer.Conversation._createFromServer = tmp;
            });

            it("Should call UserIdentity._createFromServer", function() {
                // Setup
                var tmp = layer.UserIdentity._createFromServer;
                var identity = new layer.UserIdentity({
                    id: responses.useridentity.id,
                    clientId: client.appId
                });
                spyOn(layer.UserIdentity, "_createFromServer").and.returnValue(identity);
                var identityObj = JSON.parse(JSON.stringify(responses.useridentity));

                // Run
                var identity2 = client._createObject(identityObj);

                // Posttest
                expect(identity2).toBe(identity);
                expect(layer.UserIdentity._createFromServer).toHaveBeenCalledWith(identityObj, client);

                // Restore
                layer.UserIdentity._createFromServer = tmp;
            });

            it("Should call ServiceIdentity._createFromServer", function() {
                // Setup
                var tmp = layer.ServiceIdentity._createFromServer;
                var identity = new layer.ServiceIdentity({
                    id: layer.ServiceIdentity.prefixUUID + '/dohbot',
                    clientId: client.appId
                });
                spyOn(layer.ServiceIdentity, "_createFromServer").and.returnValue(identity);
                var identityObj = {
                    name: "dohbot",
                    id: "layer:///serviceidentities/dohbot"
                };

                // Run
                var identity2 = client._createObject(identityObj);

                // Posttest
                expect(identity2).toBe(identity);
                expect(layer.ServiceIdentity._createFromServer).toHaveBeenCalledWith(identityObj, client);

                // Restore
                layer.ServiceIdentity._createFromServer = tmp;
            });
        });

        describe("The _processDelayedTriggers() method", function() {

            it("Should call _foldEvents on all conversations:add events", function() {
                // Setup
                var c1 = new layer.Conversation();
                var c2 = new layer.Conversation();
                client._triggerAsync("conversations:a", {value: "a"});
                client._triggerAsync("conversations:b", {value: "b"});
                client._triggerAsync("conversations:add", {conversations: [c1]});
                client._triggerAsync("conversations:add", {conversations: [c2]});
                client._triggerAsync("conversations:c", {value: "c"});
                spyOn(client, "_foldEvents");

                // Run
                client._processDelayedTriggers();

                // Posttest
                expect(client._foldEvents)
                    .toHaveBeenCalledWith([
                        ["conversations:add", jasmine.objectContaining({
                            conversations: [c1]
                        })],
                        ["conversations:add", jasmine.objectContaining({
                            conversations: [c2]
                        })]
                    ], "conversations", client);
            });

            it("Should call _foldEvents on all conversations:remove events", function() {
                // Setup
                var c1 = new layer.Conversation();
                var c2 = new layer.Conversation();
                client._triggerAsync("conversations:a", {value: "a"});
                client._triggerAsync("conversations:b", {value: "b"});
                client._triggerAsync("conversations:remove", {conversations: [c1]});
                client._triggerAsync("conversations:remove", {conversations: [c2]});
                client._triggerAsync("conversations:c", {value: "c"});
                spyOn(client, "_foldEvents");

                // Run
                client._processDelayedTriggers();

                // Posttest
                expect(client._foldEvents)
                    .toHaveBeenCalledWith([
                        ["conversations:remove", jasmine.objectContaining({
                            conversations: [c1]
                        })],
                        ["conversations:remove", jasmine.objectContaining({
                            conversations: [c2]
                        })]
                    ], "conversations", client);
            });

            it("Should call _foldEvents on all messages:add events", function() {
                // Setup
                var c1 = client.createConversation(["a"]);
                var m1 = new layer.Message({clientId: client.appId, parts: "a"});
                var m2 = new layer.Message({clientId: client.appId, parts: "b"});
                client._delayedTriggers = [];
                client._triggerAsync("messages:a", {value: "a"});
                client._triggerAsync("messages:b", {value: "b"});
                client._triggerAsync("messages:add", {messages: [m1]});
                client._triggerAsync("messages:add", {messages: [m2]});
                client._triggerAsync("messages:c", {value: "c"});
                spyOn(client, "_foldEvents");

                // Run
                client._processDelayedTriggers();

                // Posttest
                expect(client._foldEvents)
                    .toHaveBeenCalledWith([
                        ["messages:add", jasmine.objectContaining({
                            messages: [m1]
                        })],
                        ["messages:add", jasmine.objectContaining({
                            messages: [m2]
                        })]
                    ], "messages", client);
            });

            it("Should call _foldEvents on all messages:remove events", function() {
                // Setup
                var c1 = client.createConversation(["a"]);
                var m1 = new layer.Message({clientId: client.appId, parts: "a"});
                var m2 = new layer.Message({clientId: client.appId, parts: "b"});
                client._delayedTriggers = [];
                client._triggerAsync("messages:a", {value: "a"});
                client._triggerAsync("messages:b", {value: "b"});
                client._triggerAsync("messages:remove", {messages: [m1]});
                client._triggerAsync("messages:remove", {messages: [m2]});
                client._triggerAsync("messages:c", {value: "c"});
                spyOn(client, "_foldEvents");

                // Run
                client._processDelayedTriggers();

                // Posttest
                expect(client._foldEvents)
                    .toHaveBeenCalledWith([
                        ["messages:remove", jasmine.objectContaining({
                            messages: [m1]
                        })],
                        ["messages:remove", jasmine.objectContaining({
                            messages: [m2]
                        })]
                    ], "messages", client);
            });

            it("Should call _foldEvents on all identities:add events", function() {
                // Setup
                var i1 = new layer.UserIdentity({clientId: client.appId, userId: "a", id: "layer:///identities/a"});
                var i2 = new layer.UserIdentity({clientId: client.appId, userId: "b", id: "layer:///identities/b"});
                client._delayedTriggers = [];
                client._triggerAsync("identities:a", {value: "a"});
                client._triggerAsync("identities:b", {value: "b"});
                client._triggerAsync("identities:add", {identities: [i1]});
                client._triggerAsync("identities:add", {identities: [i2]});
                client._triggerAsync("identities:c", {value: "c"});
                spyOn(client, "_foldEvents");

                // Run
                client._processDelayedTriggers();

                // Posttest
                expect(client._foldEvents)
                    .toHaveBeenCalledWith([
                        ["identities:add", jasmine.objectContaining({
                            identities: [i1]
                        })],
                        ["identities:add", jasmine.objectContaining({
                            identities: [i2]
                        })]
                    ], "identities", client);
            });

            it("Should call _foldEvents on all identities:remove events", function() {
                // Setup
                var i1 = new layer.UserIdentity({clientId: client.appId, userId: "a", id: "layer:///identities/a"});
                var i2 = new layer.UserIdentity({clientId: client.appId, userId: "b", id: "layer:///identities/b"});
                client._delayedTriggers = [];
                client._triggerAsync("identities:a", {value: "a"});
                client._triggerAsync("identities:b", {value: "b"});
                client._triggerAsync("identities:remove", {identities: [i1]});
                client._triggerAsync("identities:remove", {identities: [i2]});
                client._triggerAsync("identities:c", {value: "c"});
                spyOn(client, "_foldEvents");

                // Run
                client._processDelayedTriggers();

                // Posttest
                expect(client._foldEvents)
                    .toHaveBeenCalledWith([
                        ["identities:remove", jasmine.objectContaining({
                            identities: [i1]
                        })],
                        ["identities:remove", jasmine.objectContaining({
                            identities: [i2]
                        })]
                    ], "identities", client);
            });
        });

        describe("The findCachedConversation() method", function() {
            var c1, c2, c3;
            beforeEach(function() {
                c1 = client.createConversation({
                    participants: ["a"],
                    metadata: {
                        b: "c"
                    }
                });
                c2 = client.createConversation({
                    participants: ["b"],
                    metadata: {
                        d: "e"
                    }
                });
                c3 = client.createConversation({
                    participants: ["c"]
                });

            });

            it("Should call the callback with each Conversation", function() {
                // Setup
                var spy = jasmine.createSpy('spy');

                // Run
                client.findCachedConversation(spy);

                // Posttest
                expect(spy).toHaveBeenCalledWith(c1, 0);
                expect(spy).toHaveBeenCalledWith(c2, 1);
                expect(spy).toHaveBeenCalledWith(c3, 2);
            });

            it("Should call the callback with correct context", function() {
                // Setup
                var d = new Date();

                // Run
                client.findCachedConversation(function(conversation) {
                    expect(this).toBe(d);
                }, d);
            });

            it("Should return undefined if no matches", function() {
                // Run
                var result = client.findCachedConversation(function(conversation) {
                    return false;
                });

                // Posttest
                expect(result).toBe(undefined);
            });

            it("Should return matching Conversation", function() {
                // Run
                var result = client.findCachedConversation(function(conversation) {
                    return conversation.participants.indexOf("b") != -1;
                });

                // Posttest
                expect(result).toBe(c2);
            });
        });

        describe("The _resetSession() method", function() {
            it("Should call _cleanup", function() {
                // Setup
                spyOn(client, "_cleanup");

                // Run
                client._resetSession();

                // Posttest
                expect(client._cleanup).toHaveBeenCalled();
            });

            it("Should reset conversation data", function() {
                // Setup
                client.createConversation(["a"]);

                // Run
                client._resetSession();

                // Posttest
                expect(client._conversationsHash).toEqual({});
            });

            it("Should reset message data", function() {
                // Setup
                client.createConversation(["a"]).createMessage("Hi").send();

                // Run
                client._resetSession();

                // Posttest
                expect(client._messagesHash).toEqual({});
            });

            it("Should reset query data", function() {
                // Setup
                client._clientReady();
                client.createQuery({model: "Conversation"});

                // Run
                client._resetSession();

                // Posttest
                expect(client._queriesHash).toEqual({});
            });

            it("Should reset identity data", function() {
                // Setup
                client._clientReady();
                var userIdentity = new layer.UserIdentity({
                    clientId: client.appId,
                    id: "layer:///identities/1",
                    displayName: "UserIdentity"
                });
                var serviceIdentity = new layer.ServiceIdentity({
                    clientId: client.appId,
                    id: "layer:///serviceidentities/2",
                    name: "ServiceIdentity"
                });

                // Run
                client._resetSession();

                // Posttest
                expect(client._identitiesHash).toEqual({});
                expect(client._serviceIdentitiesHash).toEqual({});
            });
        });

        describe("The createConversation() method", function() {
            var createMethod;
            beforeEach(function() {
                createMethod = layer.Conversation.create;
                spyOn(layer.Conversation, "create").and.returnValue(5);
            });

            afterEach(function() {
                layer.Conversation.create = createMethod;
            });

            it("Should create a conversation with just a participant array", function() {
                // Run
                var c = client.createConversation(["a","z"]);

                // Posttest
                expect(layer.Conversation.create).toHaveBeenCalledWith({
                    participants: ["a", "z"],
                    distinct: true,
                    client: client
                });
            });

            it("Should create a conversation with a full object", function() {
                // Run
                var c = client.createConversation({participants: ["a","z"]});

                // Posttest
                expect(layer.Conversation.create).toHaveBeenCalledWith({
                    participants: ["a", "z"],
                    distinct: true,
                    client: client
                });
            });

            it("Should create a conversation with a full object", function() {
                // Run
                var c = client.createConversation({
                participants: ["a","z"],
                distinct: false
                });

                // Posttest
                expect(layer.Conversation.create).toHaveBeenCalledWith({
                    participants: ["a", "z"],
                    distinct: false,
                    client: client
                });
            });

            it("Should return the new conversation", function() {
                // Run
                var c = client.createConversation(["a","z"]);

                // Posttest
                expect(c).toEqual(5);
            });
        });

        describe("The createQuery() method", function() {
            beforeEach(function() {
            client._clientReady();
            });
            it("Should return a Query from options", function() {
                var query = client.createQuery({
                    model: "Conversation"
                });

                expect(query).toEqual(jasmine.any(layer.Query));
                expect(query.client).toBe(client);
                expect(query.model).toEqual("Conversation");
            });

            it("Should return a Query from QueryBuilder", function() {
                var query = client.createQuery(layer.QueryBuilder.conversations());

                expect(query).toEqual(jasmine.any(layer.Query));
                expect(query.client).toBe(client);
                expect(query.model).toEqual("Conversation");
            });

            it("Should call _addQuery", function() {
                spyOn(client, "_addQuery");
                var query = client.createQuery({
                    model: "Conversation"
                });
                expect(client._addQuery).toHaveBeenCalledWith(query);
            });
        });

        describe("The getQuery() method", function() {
            beforeEach(function() {
            client._clientReady();
            });
            it("Should throw an error if an invalid id is passed in", function() {
                expect(function() {
                    client.getQuery(5);
                }).toThrowError(layer.LayerError.dictionary.idParamRequired);
                expect(layer.LayerError.dictionary.idParamRequired.length > 0).toEqual(true);
            });

            it("Should return a Query if it exists", function() {
                var q = client.createQuery({
                    model: "Conversation"
                });
                expect(client.getQuery(q.id)).toBe(q);
            });

            it("Should return undefined if it does not exist", function() {
                var q = client.createQuery({
                    model: "Conversation"
                });
                expect(client.getQuery(q.id + "1")).toBe(null);
            });
        });

        // TODO: May want to break these up, but they form a fairly simple self contained test
        describe("The _checkAndPurgeCache(), _isCachedObject and _removeObject methods", function() {
            beforeEach(function() {
            client._clientReady();
            });

            it("Should destroy Conversations if there are no Queries", function() {
                var c1 = client.createConversation(["a"]);
                var c2 = client.createConversation(["b"]);
                var c3 = client.createConversation(["c"]);

                // Run
                client._checkAndPurgeCache([c1, c2, c3]);

                // Posttest
                expect(Object.keys(client._conversationsHash)).toEqual([]);
                expect(c1.isDestroyed).toBe(true);
                expect(c2.isDestroyed).toBe(true);
                expect(c3.isDestroyed).toBe(true);
            });

            it("Should ignore destroyed objects", function() {
                var c1 = client.createConversation(["a"]);
                var c2 = client.createConversation(["b"]);
                var c3 = client.createConversation(["c"]);
                c2.isDestroyed = true;

                // Run
                client._checkAndPurgeCache([c1, c2, c3]);

                // Posttest
                expect(Object.keys(client._conversationsHash)).toEqual([c2.id]);
                expect(c1.isDestroyed).toBe(true);
                expect(c2.isDestroyed).toBe(true);
                expect(c3.isDestroyed).toBe(true);
            });

            it("Should keep Conversations if they are in a Query and remove and destroy all others", function() {
                // Setup
                var query = client.createQuery({model: layer.Query.Conversation});
                var c1 = client.createConversation(["a"]);
                var c2 = client.createConversation(["b"]);
                var c3 = client.createConversation(["c"]);
                query.data = [c1, c3];

                // Pretest
                expect(Object.keys(client._conversationsHash))
                    .toEqual(jasmine.arrayContaining([c1.id, c2.id, c3.id]));

                // Run
                client._checkAndPurgeCache([c1, c2, c3]);

                // Posttest
                expect(Object.keys(client._conversationsHash)).toEqual(jasmine.arrayContaining([c1.id, c3.id]));
                expect(c1.isDestroyed).toBe(false);
                expect(c2.isDestroyed).toBe(true);
                expect(c3.isDestroyed).toBe(false);
            });


            it("Should handle immutable objects; keeping Conversations if they are in a Query and remove and destroy all others", function() {
                // Setup
                var query = client.createQuery({model: layer.Query.Conversation});
                var c1 = client.createConversation(["a"]);
                var c2 = client.createConversation(["b"]);
                var c3 = client.createConversation(["c"]);
                query.data = [c1, c3];

                // Pretest
                expect(Object.keys(client._conversationsHash))
                    .toEqual(jasmine.arrayContaining([c1.id, c2.id, c3.id]));

                // Run
                client._checkAndPurgeCache([c1.toObject(), c2.toObject(), c3.toObject()]);

                // Posttest
                expect(Object.keys(client._conversationsHash)).toEqual(jasmine.arrayContaining([c1.id, c3.id]));
                expect(c1.isDestroyed).toBe(false);
                expect(c2.isDestroyed).toBe(true);
                expect(c3.isDestroyed).toBe(false);
            });

            it("Should keep Messages if they are in a Query and remove and destroy all others", function() {
                // Setup
                var c = client.createConversation(["a"]);
                var query = client.createQuery({
                    model: layer.Query.Message,
                    predicate: "conversation.id = '" + c.id + "'"
                });
                var m1 = c.createMessage("a").send();
                var m2 = c.createMessage("b").send();
                var m3 = c.createMessage("c").send();
                jasmine.clock().tick(1);

                // Pretest
                expect(query.data).toEqual([m3, m2, m1]);

                query.data = [m1, m3];

                // Pretest
                expect(Object.keys(client._messagesHash)).toEqual(jasmine.arrayContaining([m1.id, m2.id, m3.id]));

                // Run
                client._checkAndPurgeCache([m1, m2, m3]);

                // Posttest
                expect(Object.keys(client._messagesHash)).toEqual(jasmine.arrayContaining([m1.id, m3.id]));
                expect(m1.isDestroyed).toBe(false);
                expect(m2.isDestroyed).toBe(true);
                expect(m3.isDestroyed).toBe(false);
            });
        });

        describe("The _scheduleCheckAndPurgeCache() method", function() {
        var conversation;
        beforeEach(function() {
            conversation = client.createConversation({
                participants: ["a","z"],
                distinct: false
            });
            conversation.syncState = layer.Constants.SYNC_STATE.SYNCED;
        });

        afterEach(function() {
            conversation.destroy();
        });

        it("Should schedule call to _runScheduledCheckAndPurgeCache if unscheduled", function() {
            client._scheduleCheckAndPurgeCacheAt = 0;
            spyOn(client, "_runScheduledCheckAndPurgeCache");

            // Run
            client._scheduleCheckAndPurgeCache(conversation);
            jasmine.clock().tick(layer.Client.CACHE_PURGE_INTERVAL + 1);

            // Posttest
            expect(client._runScheduledCheckAndPurgeCache).toHaveBeenCalledWith();
        });

        it("Should schedule call to _runScheduledCheckAndPurgeCache if late", function() {
            client._scheduleCheckAndPurgeCacheAt = Date.now() - 10;
            spyOn(client, "_runScheduledCheckAndPurgeCache");

            // Run
            client._scheduleCheckAndPurgeCache(conversation);
            jasmine.clock().tick(layer.Client.CACHE_PURGE_INTERVAL + 1);

            // Posttest
            expect(client._runScheduledCheckAndPurgeCache).toHaveBeenCalledWith();
        });

        it("Should not schedule call to _runScheduledCheckAndPurgeCache if already scheduled", function() {
            client._scheduleCheckAndPurgeCacheAt = Date.now() + 10;
            spyOn(client, "_runScheduledCheckAndPurgeCache");

            // Run
            client._scheduleCheckAndPurgeCache(conversation);
            jasmine.clock().tick(layer.Client.CACHE_PURGE_INTERVAL + 1);

            // Posttest
            expect(client._runScheduledCheckAndPurgeCache).not.toHaveBeenCalled();
        });

        it("Should add object to _scheduleCheckAndPurgeCacheItems if new schedule", function() {
            client._scheduleCheckAndPurgeCacheAt = 0;
            client._scheduleCheckAndPurgeCache(conversation);
            expect(client._scheduleCheckAndPurgeCacheItems).toEqual([conversation]);
        });

        it("Should add object to _scheduleCheckAndPurgeCacheItems if no new schedule", function() {
            client._scheduleCheckAndPurgeCacheAt = Date.now() + 10;
            client._scheduleCheckAndPurgeCache(conversation);
            expect(client._scheduleCheckAndPurgeCacheItems).toEqual([conversation]);
        });

        it("Should ignore unsaved objects", function() {
            conversation.syncState = layer.Constants.SYNC_STATE.SAVING;
            client._scheduleCheckAndPurgeCacheAt = Date.now() + 10;
            client._scheduleCheckAndPurgeCache(conversation);
            expect(client._scheduleCheckAndPurgeCacheItems).toEqual([]);
        });
        });

        describe("The _runScheduledCheckAndPurgeCache() method", function() {
        var c1, c2, c3;
            beforeEach(function() {
                c1 = client.createConversation(["a"]);
                c2 = client.createConversation(["b"]);
                c3 = client.createConversation(["c"]);
                client._scheduleCheckAndPurgeCacheItems = [c1, c2, c3];
                client._scheduleCheckAndPurgeCacheAt = Date.now() + 10;
            });
        it("Should call _checkAndPurgeCache", function() {
            spyOn(client, "_checkAndPurgeCache");
            client._runScheduledCheckAndPurgeCache();
            expect(client._checkAndPurgeCache).toHaveBeenCalledWith([c1, c2, c3]);
        });

        it("Should clear the list", function() {
            client._runScheduledCheckAndPurgeCache();
            expect(client._scheduleCheckAndPurgeCacheItems).toEqual([]);
        });

        it("Should clear the scheduled time", function() {
            client._runScheduledCheckAndPurgeCache();
            expect(client._scheduleCheckAndPurgeCacheAt).toEqual(0);
        });
        });

        describe("The _removeQuery() method", function() {
            var query, c1, c2, c3;
            beforeEach(function() {
                client._clientReady();
                query = client.createQuery({model: "Conversation"});
                c1 = client.createConversation(["a"]);
                c2 = client.createConversation(["b"]);
                c3 = client.createConversation(["c"]);
                query.data = [c1, c2, c3];
            });

            it("Should call _checkAndPurgeCache with Conversations that are registered", function() {
                spyOn(client, "_checkAndPurgeCache");
                delete client._conversationsHash[c2.id];
                client._removeQuery(query);
                expect(client._checkAndPurgeCache).toHaveBeenCalledWith([c1, c3]);
            });

            it("Should remove the query from cache", function() {
                expect(client.getQuery(query.id)).toBe(query);
                client._removeQuery(query);
                expect(client.getQuery(query.id)).toBe(null);
            });

            it("Should do nothing if no query", function() {
                expect(function() {
                    client._removeQuery();
                }).not.toThrow();
            });
        });

        describe("The _connectionRestored() method", function() {
        var q1, q2, conversation;
        beforeEach(function() {
            client._clientReady();
            conversation = client.createConversation(["a"]);
            q1 = client.createQuery({model: "Conversation"});
            q2 = client.createQuery({model: "Message", predicate: 'conversation.id = \'' + conversation.id + '\''});
        });

        it("Should call reset on all queries if duration was large", function() {
            spyOn(q1, "reset");
            spyOn(q2, "reset");

            // Run
            client.trigger('online', {
            isOnline: true,
            reset: true
            });

            // Posttest
            expect(q1.reset).toHaveBeenCalledWith();
            expect(q2.reset).toHaveBeenCalledWith();
        });

        it("Should not call reset on all queries if duration was small", function() {
            spyOn(q1, "reset");
            spyOn(q2, "reset");

            // Run
            client.trigger('online', {
            isOnline: true,
            reset: false
            });

            // Posttest
            expect(q1.reset).not.toHaveBeenCalled();
            expect(q2.reset).not.toHaveBeenCalled();

        });

        });

        describe("The createTypingListener() method", function() {
            it("Should return a layer.TypingListener.TypingListener", function() {
                var input = document.createElement("input");
                expect(client.createTypingListener(input)).toEqual(jasmine.any(layer.TypingIndicators.TypingListener));
            });

            it("Should get a proper client ID property", function() {
                var input = document.createElement("input");
                expect(client.createTypingListener(input).clientId).toBe(client.appId);
            });

            it("Should get a proper input property", function() {
                var input = document.createElement("input");
                expect(client.createTypingListener(input).input).toBe(input);
            });
        });

        describe("The createTypingPublisher() method", function() {
            it("Should return a layer.TypingListener.TypingPublisher", function() {
                expect(client.createTypingPublisher()).toEqual(jasmine.any(layer.TypingIndicators.TypingPublisher));
            });

            it("Should get a proper client ID", function() {
                expect(client.createTypingPublisher().clientId).toBe(client.appId);
            });
        });

        describe("The getClient() static method", function() {
            it("Should get a registered client", function() {
                var client = new layer.Client({
                    appId: "test1"
                });
                expect(layer.Client.getClient("test1")).toBe(client);
            });

            it("Should not get an unregistered client", function() {
                var client = new layer.Client({
                    appId: "test1"
                });
                expect(layer.Client.getClient("test2")).toBe(undefined);
            });
        });
    });
});
