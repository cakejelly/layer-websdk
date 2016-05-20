/*eslint-disable */

describe("The Client Authenticator Class", function() {
    var appId = "layer:///apps/staging/ffffffff-ffff-ffff-ffff-ffffffffffff";
    var userId = "93c83ec4-b508-4a60-8550-099f9c42ec1a";
    var identityToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImN0eSI6ImxheWVyLWVpdDt2PTEiLCJraWQiOiIyOWUzN2ZhZS02MDdlLTExZTQtYTQ2OS00MTBiMDAwMDAyZjgifQ.eyJpc3MiOiI4YmY1MTQ2MC02MDY5LTExZTQtODhkYi00MTBiMDAwMDAwZTYiLCJwcm4iOiI5M2M4M2VjNC1iNTA4LTRhNjAtODU1MC0wOTlmOWM0MmVjMWEiLCJpYXQiOjE0MTcwMjU0NTQsImV4cCI6MTQxODIzNTA1NCwibmNlIjoiRFZPVFZzcDk0ZU9lNUNzZDdmaWVlWFBvUXB3RDl5SjRpQ0EvVHJSMUVJT25BSEdTcE5Mcno0Yk9YbEN2VDVkWVdEdy9zU1EreVBkZmEydVlBekgrNmc9PSJ9.LlylqnfgK5nhn6KEsitJMsjfayvAJUfAb33wuoCaNChsiRXRtT4Ws_mYHlgwofVGIXKYrRf4be9Cw1qBKNmrxr0er5a8fxIN92kbL-DlRAAg32clfZ_MxOfblze0DHszvjWBrI7F-cqs3irRi5NbrSQxeLZIiGQdBCn8Qn5Zv9s";

    var client, requests;

    beforeAll(function() {
        jasmine.addCustomEqualityTester(mostRecentEqualityTest);
        jasmine.addCustomEqualityTester(responseTest);
    });

    beforeEach(function() {
        jasmine.clock().install();
        jasmine.Ajax.install();
        requests = jasmine.Ajax.requests;

        client = new layer.ClientAuthenticator({
            appId: appId,
            reset: true,
            url: "https://duh.com"
        });
    });

    afterEach(function() {
        jasmine.clock().uninstall();
        jasmine.Ajax.uninstall();
    });

    afterAll(function() {
        layer.Client.destroyAllClients();
    });

    describe("The constructor method", function() {
        it("Should return a new client", function() {
            var clientLocal = new layer.ClientAuthenticator({
                appId: appId,
                url: "https://duh.com"
            });

            expect(clientLocal instanceof layer.ClientAuthenticator).toBe(true);
        });

        it("Should require an appId", function() {
            expect(function() {
                var clientLocal = new layer.ClientAuthenticator({
                    appId: "",
                    url: "https://duh.com"
                });
            }).toThrowError(layer.LayerError.dictionary.appIdMissing);
            expect(layer.LayerError.dictionary.appIdMissing.length > 0).toBe(true);
        });
    });

    describe("The _initComponents() method", function() {
        it("Should initialize the socketManager", function() {
            expect(client.socketManager).toBe(null);
            client._initComponents();
            expect(client.socketManager).not.toBe(null);
            client._destroyComponents();
        });

        it("Should initialize the onlineManager", function() {
            expect(client.onlineManager).toBe(null);
            client._initComponents();
            expect(client.onlineManager).not.toBe(null);
            client._destroyComponents();
        });

        it("Should setup events for the onlineManager", function() {
            spyOn(client, "_handleOnlineChange");
            client._initComponents();
            client.onlineManager.trigger('connected');
            expect(client._handleOnlineChange).toHaveBeenCalledWith(jasmine.any(layer.LayerEvent));
            client.onlineManager.trigger('disconnected');
            expect(client._handleOnlineChange).toHaveBeenCalledWith(jasmine.any(layer.LayerEvent));
        });

        it("Should initialize the syncManager", function() {
            expect(client.syncManager).toBe(null);
            client._initComponents();
            expect(client.syncManager).not.toBe(null);
            client._destroyComponents();
        });

        it("Should setup the onlineManager", function() {
            client._initComponents();
            client.isAuthenticated = true;
            spyOn(client.socketManager, "connect");
            client.onlineManager.trigger("connected");
            expect(client.socketManager.connect).toHaveBeenCalled();
            client._destroyComponents();
        });
    });

    describe("Non constructor methods", function () {
        beforeEach(function () {
            client._initComponents();
        });

        afterEach(function () {
            if (!client.onlineManager.isDestroyed) client._destroyComponents();
        });

        describe("The _restoreLastSession() method", function () {
            it("Should do nothing if persistence is disabled", function () {
                // Setup
                localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId] = JSON.stringify({
                    userId: 'FrodoTheDodo',
                    sessionToken: 'fred',
                    expires: Date.now() + 10000000
                });
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(true);

                // Run
                client._restoreLastSession();

                // Posttest
                expect(client.sessionToken).toEqual('');
            });

            it("Should do nothing if no data", function () {
                // Setup
                localStorage.removeItem([layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId]);
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(false);

                // Run
                client._restoreLastSession();

                // Posttest
                expect(client.sessionToken).toEqual('');
            });

            it("Should set the sessionToken if present and not expired", function () {
                // Setup
                localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId] = JSON.stringify({
                    userId: 'FrodoTheDodo',
                    sessionToken: 'fred',
                    expires: Date.now() + 10000000
                });
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(false);
                client.__userId = 'FrodoTheDodo';

                // Run
                client._restoreLastSession();

                // Posttest
                expect(client.sessionToken).toEqual('fred');
            });

            it("Should not set the sessionToken if present and expired but should delete it", function () {
                // Setup
                localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId] = JSON.stringify({
                    userId: 'FrodoTheDodo',
                    sessionToken: 'fred',
                    expires: Date.now() - 100
                });
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(false);
                client.__userId = 'FrodoTheDodo';

                // Run
                client._restoreLastSession();

                // Posttest
                expect(client.sessionToken).toEqual('');
                expect(localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId]).toBe(undefined);
            });

            it("Should not set the sessionToken if present and persitence disabled", function () {
                // Setup
                localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId] = JSON.stringify({
                    userId: 'FrodoTheDodo',
                    sessionToken: 'fred'
                });
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(true);
                client.__userId = 'FrodoTheDodo';

                // Run
                client._restoreLastSession();

                // Posttest
                expect(client.sessionToken).toEqual('');
            });
        });

        describe("The _hasUserIdChanged() method", function () {
            it("Should find the useId for this appId and return false if it matches the input userId", function () {
                // Setup
                localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId] = JSON.stringify({
                    userId: 'FrodoTheDodo',
                    sessionToken: '',
                    expires: Date.now() + 10000000
                });

                // Run
                expect(client._hasUserIdChanged('FrodoTheDodo')).toBe(false);
            });

            it("Should return true if there is no session data", function () {
                // Setup
                localStorage.removeItem([layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId]);

                // Run
                expect(client._hasUserIdChanged('FrodoTheDodo')).toBe(true);
            });

            it("Should return true if there is a change in userId from the session data", function () {
                // Setup
                localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId] = JSON.stringify({
                    userId: 'Samwise',
                    sessionToken: '',
                    expires: Date.now() + 10000000
                });

                // Run
                expect(client._hasUserIdChanged('FrodoTheDodo')).toBe(true);
            });
        });


        describe("The connect() method", function () {
            it("Should call onlineManager.start()", function () {
                spyOn(client.onlineManager, "start");
                client.connect('Frodo');
                expect(client.onlineManager.start).toHaveBeenCalledWith();
            });

            it("Should call _clearStoredData if not a trusted device", function () {
                // Setup
                client.isTrustedDevice = false;
                spyOn(client, "_clearStoredData");

                // Run
                client.connect("hey");

                // Posttest
                expect(client._clearStoredData).toHaveBeenCalledWith();
            });

            it("Should call _clearStoredData if a trusted device but no userId", function () {
                // Setup
                client.isTrustedDevice = true;
                spyOn(client, "_clearStoredData");

                // Run
                client.connect();

                // Posttest
                expect(client._clearStoredData).toHaveBeenCalledWith();
            });

            it("Should call _clearStoredData if a trusted device with userId but persistedSessions disabled", function () {
                // Setup
                client.isTrustedDevice = true;
                spyOn(client, "_clearStoredData");
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(true);

                // Run
                client.connect("hey");

                // Posttest
                expect(client._clearStoredData).toHaveBeenCalledWith();
            });

            it("Should call _clearStoredData if a trusted device with userId and persistedSessions enabled but userId has changed", function () {
                // Setup
                client.isTrustedDevice = true;
                spyOn(client, "_clearStoredData");
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(false);
                spyOn(client, "_hasUserIdChanged").and.returnValue(true);

                // Run
                client.connect("hey");

                // Posttest
                expect(client._clearStoredData).toHaveBeenCalledWith();
            });

            it("Should not call _clearStoredData if a trusted device with userId and persistedSessions enabled and userId has not changed", function () {
                // Setup
                client.isTrustedDevice = true;
                spyOn(client, "_clearStoredData");
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(false);
                spyOn(client, "_hasUserIdChanged").and.returnValue(false);

                // Run
                client.connect("hey");

                // Posttest
                expect(client._clearStoredData).not.toHaveBeenCalled();
            });

            it("Should call _restoreLastSession if its a trustedDevice and has a userId", function () {
                // Setup
                client.isTrustedDevice = true;
                spyOn(client, "_restoreLastSession");

                // Run
                client.connect("hey");

                // Posttest
                expect(client._restoreLastSession).toHaveBeenCalledWith("hey");
            });

            it("Should set the userId", function () {
                // Run
                client.connect("hey");

                // Posttest
                expect(client.userId).toEqual("hey");

            });

            it("Should request a nonce if there is no sessionToken", function () {
                // Pretest
                expect(client.sessionToken).toEqual("");

                // Run
                client.connect("FrodoTheDodo");
                requests.mostRecent().response({
                    status: 200
                });

                // Posttest
                expect(requests.mostRecent()).toEqual({
                    url: client.url + "/nonces",
                    requestHeaders: {
                        "content-type": "application/json",
                        "accept": "application/vnd.layer+json; version=1.0"
                    },
                    method: "POST"
                });

            });

            it("Should call _connectionResponse with the nonce response", function () {
                // Setup
                spyOn(client, "_connectionResponse");

                // Pretest
                expect(client.sessionToken).toEqual("");

                // Run
                client.connect("FrodoTheDodo");
                requests.mostRecent().response({
                    status: 200
                });

                // Posttest
                expect(client._connectionResponse).toHaveBeenCalled();
            });

            it("Should call _sessionTokenRestored if token is found", function () {
                // Setup
                client.sessionToken = "sessionToken";
                expect(client.sessionToken).toEqual("sessionToken");
                spyOn(client, "_sessionTokenRestored");
                var tmp = client._connect;
                client._connect = function () { };
                client._connect = tmp;

                // Run
                client.connect("FrodoTheDodo");

                // Posttest
                expect(client._sessionTokenRestored).toHaveBeenCalledWith();
            });
        });

        describe("The connectWithSession() method", function () {
            it("Should call onlineManager.start()", function () {
                spyOn(client.onlineManager, "start");
                client.connectWithSession('Frodo', 'FrodoSession');
                expect(client.onlineManager.start).toHaveBeenCalledWith();
            });

            it("Should throw errors if no userId or sessionToken", function () {
                expect(function () {
                    client.connectWithSession('', 'sessionToken');
                }).toThrowError(layer.LayerError.dictionary.sessionAndUserRequired);

                expect(function () {
                    client.connectWithSession('userId', '');
                }).toThrowError(layer.LayerError.dictionary.sessionAndUserRequired);
            });

            it("Should set the userId", function () {
                // Pretest
                expect(client.userId).toEqual('');

                // Run
                client.connectWithSession('userId', 'sessionToken');

                // Posttest
                expect(client.userId).toEqual('userId');
            });

            it("Should start the onlineManager", function () {
                // Setup
                spyOn(client.onlineManager, "start");

                // Run
                client.connectWithSession('userId', 'sessionToken');

                // Posttest
                expect(client.onlineManager.start).toHaveBeenCalledWith();
            });


            it("Should call _clearStoredData if not a trusted device", function () {
                // Setup
                client.isTrustedDevice = false;
                spyOn(client, "_clearStoredData");

                // Run
                client.connectWithSession("hey", "ho");

                // Posttest
                expect(client._clearStoredData).toHaveBeenCalledWith();
            });

            it("Should call _clearStoredData if a trusted device with userId but persistedSessions disabled", function () {
                // Setup
                client.isTrustedDevice = true;
                spyOn(client, "_clearStoredData");
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(true);

                // Run
                client.connectWithSession('userId', 'sessionToken');

                // Posttest
                expect(client._clearStoredData).toHaveBeenCalledWith();
            });

            it("Should call _clearStoredData if a trusted device with userId and persistedSessions enabled but userId has changed", function () {
                // Setup
                client.isTrustedDevice = true;
                spyOn(client, "_clearStoredData");
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(false);
                spyOn(client, "_hasUserIdChanged").and.returnValue(true);

                // Run
                client.connectWithSession('userId', 'sessionToken');

                // Posttest
                expect(client._clearStoredData).toHaveBeenCalledWith();
            });

            it("Should not call _clearStoredData if a trusted device with userId and persistedSessions enabled and userId has not changed", function () {
                // Setup
                client.isTrustedDevice = true;
                spyOn(client, "_clearStoredData");
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(false);
                spyOn(client, "_hasUserIdChanged").and.returnValue(false);

                // Run
                client.connectWithSession('userId', 'sessionToken');

                // Posttest
                expect(client._clearStoredData).not.toHaveBeenCalled();
            });


            it("Should call _authComplete asynchronously", function () {
                // Setup
                spyOn(client, "_authComplete");

                // Run
                client.connectWithSession('userId', 'sessionToken');
                expect(client._authComplete).not.toHaveBeenCalled();
                jasmine.clock().tick(2);

                // Posttest
                expect(client._authComplete).toHaveBeenCalledWith({ session_token: 'sessionToken' });
            });
        });

        describe("The _connectionResponse() method", function () {
            it("Should call _connectionError if success is false", function () {
                spyOn(client, "_connectionError");
                client._connectionResponse({
                    success: false,
                    data: "Doh!"
                });
                expect(client._connectionError).toHaveBeenCalledWith("Doh!");
            });

            it("Should call _connectionComplete if success is true", function () {
                spyOn(client, "_connectionComplete");
                client._connectionResponse({ success: true, data: "Doh!" });
                expect(client._connectionComplete).toHaveBeenCalledWith("Doh!");
            });
        });

        describe("The _connectionError() method", function () {
            it("Should trigger connected-error", function () {
                // Setup
                var response = new layer.LayerError(responses.error1);
                spyOn(client, "trigger");

                // Run
                client._connectionError(response);

                // Posttest
                expect(client.trigger).toHaveBeenCalledWith("connected-error", { error: response })
            });
        });


        describe("The _connectionComplete() method", function () {
            it("Should trigger 'connected'", function () {
                // Setup
                spyOn(client, "trigger");

                // Run
                client._connectionResponse({
                    status: 200,
                    success: true,
                    data: { nonce: "mynonce" }
                });

                // Posttest
                expect(client.trigger).toHaveBeenCalledWith("connected");
            });

            it("Should call _authenticate", function () {
                // Setup
                spyOn(client, "_authenticate");

                // Run
                client._connectionResponse({
                    status: 200,
                    success: true,
                    data: { nonce: "mynonce" }
                });

                // Posttest
                expect(client._authenticate).toHaveBeenCalledWith("mynonce");

            });

            it("Should set isConnected to true", function () {
                // Pretest
                expect(client.isConnected).toEqual(false);

                // Run
                client._connectionResponse({
                    status: 200,
                    success: true,
                    data: { nonce: "mynonce" }
                });

                // Posttest
                expect(client.isConnected).toEqual(true);
            });
        });

        describe("The _authenticate() method", function () {
            it("Should do nothing if not provided with a nonce", function () {
                spyOn(client, "trigger");
                client._authenticate("");
                expect(client.trigger).not.toHaveBeenCalled();
            });

            it("Should provide the challenge event", function () {
                spyOn(client, "trigger");
                client._authenticate("mynonce");

                // Posttest
                expect(client.trigger).toHaveBeenCalledWith("challenge", {
                    nonce: "mynonce",
                    callback: jasmine.any(Function)
                });
            });
        });

        describe("The answerAuthenticationChallenge() method", function () {
            it("Should fail without an identityToken", function () {
                expect(function () {
                    client.answerAuthenticationChallenge();
                }).toThrowError(layer.LayerError.dictionary.identityTokenMissing);
                expect(layer.LayerError.dictionary.identityTokenMissing.length > 0).toBe(true);
            });

            it("Should set a userId", function () {
                // Pretest
                expect(client.userId).toEqual("");

                // Run
                client.answerAuthenticationChallenge(identityToken);

                // Posttest
                expect(client.userId).toEqual("93c83ec4-b508-4a60-8550-099f9c42ec1a");
            });

            it("Should accept a userId if it matches the current userId", function () {
                // Setup
                client.__userId = "93c83ec4-b508-4a60-8550-099f9c42ec1a";

                // Run
                client.answerAuthenticationChallenge(identityToken);

                // Posttest
                expect(client.userId).toEqual("93c83ec4-b508-4a60-8550-099f9c42ec1a");
            });

            it("Should reject a userId if it fails to match the current userId", function () {
                // Setup
                client.__userId = "FrodoTheDodo";

                // Run
                client.answerAuthenticationChallenge(identityToken);

                // Posttest
                expect(client.userId).toEqual("93c83ec4-b508-4a60-8550-099f9c42ec1a");
            });


            it("Should set a userId with a url encoded url that is not base64", function () {
                // Pretest
                expect(client.userId).toEqual("");

                // Run
                client.answerAuthenticationChallenge("eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImN0eSI6ImxheWVyLWVpdDt2PTEiLCJraWQiOiI5NGZkYzM2MC1iZWU5LTExZTUtOWMwNy0xMzdlMDAwMDAwYjAifQ.eyJpc3MiOiI1OGMxN2Y4NC1iYjFjLTExZTUtOGRiOC0wMTA0MDAwMDAwYjAiLCJwcm4iOiJIZXlIbzAwMTgzOTk2ODU4MzU1NDE5NjgiLCJpYXQiOjE0NjE3MDMzOTIsImV4cCI6MTQ2MjkxMjk5MiwibmNlIjoic0FWcERhNlM2VV9aSk9ISzVBQXRXaHRVb3ZsalpsT0U4eDV6LWdEcUdZMDVrWjk4VkdRaVlEQVJPeU9FVll2Yl9IYmtoNG9tQWU2ZXlZM0lvczlOSUEiLCJkaXNwbGF5X25hbWUiOiJIZXlIbyIsImF2YXRhcl91cmwiOiJodHRwOi8vZ29vZ2xlLmNvbS8_cT1oZXlobyJ9.JZVjR92thQR1J4p47vV7elsmTQOC3qGP_ofDc0-LJKCBvCOL0wi1I2NTvfXmiB_M0M6DjiHuPZA7-gNQY8-L3NqZs4-UmamkgK3oV3HeplDcvye7a23QfJgHDoyuluNWKERb3j8ho1UdNqihynqJjM7iYaYQfWQRgSRhYbwLAjQ");

                // Posttest
                expect(client.userId).toEqual("HeyHo0018399685835541968");
            });

            it("Should request a sessionToken", function () {
                // Setup
                spyOn(client, "xhr");

                // Run
                client.answerAuthenticationChallenge(identityToken);

                // Posttest
                expect(client.xhr).toHaveBeenCalledWith({
                    url: "/sessions",
                    method: "POST",
                    sync: false,
                    data: {
                        "identity_token": identityToken,
                        "app_id": client.appId
                    }
                }, jasmine.any(Function));
            });

            it("Should call _authResponse on completion", function () {
                // Setup
                spyOn(client, "_authResponse");
                var response = {
                    status: 200,
                    responseText: JSON.stringify({ doh: "a deer" })
                };

                // Run
                client.answerAuthenticationChallenge(identityToken);
                requests.mostRecent().response(response);

                // Posttest
                expect(client._authResponse).toHaveBeenCalledWith(jasmine.objectContaining({
                    status: 200,
                    success: true
                }), identityToken);
            });
        });

        describe("The _authResponse() method", function () {
            it("Should call _authError if success is false", function () {
                spyOn(client, "_authError");
                client._authResponse({ success: false, data: "Doh!" }, identityToken);
                expect(client._authError).toHaveBeenCalledWith("Doh!", identityToken);
            });

            it("Should call _authComplete if success is true", function () {
                spyOn(client, "_authComplete");
                client._authResponse({ success: true, data: "Doh!" }, identityToken);
                expect(client._authComplete).toHaveBeenCalledWith("Doh!");
            });
        });

        describe("The _authComplete() method", function () {

            it("Should set the sessionToken", function () {
                // Pretest
                expect(client.sessionToken).toEqual("");

                // Run
                client._authComplete({
                    session_token: "sessionToken"
                });

                // Posttest
                expect(client.sessionToken).toEqual("sessionToken");
            });

            it("Should call _clientAuthenticated", function () {
                spyOn(client, "_clientAuthenticated");

                // Run
                client._authComplete({
                    session_token: "sessionToken"
                });

                // Posttest
                expect(client._clientAuthenticated).toHaveBeenCalledWith();
            });

            it("Should write localStorage if _isPersistedSessionsDisabled is false", function () {
                // Setup
                localStorage.removeItem([layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId]);
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(false);
                client.__userId = "FrodoTheDodo";

                // Run
                client._authComplete({
                    session_token: "sessionToken"
                });

                // Posttest
                expect(JSON.parse(localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId])).toEqual({
                    sessionToken: "sessionToken",
                    userId: "FrodoTheDodo",
                    expires: jasmine.any(Number)
                });
            });

            it("Should ignore localStorage if _isPersistedSessionsDisabled is true", function () {
                // Setup
                localStorage.removeItem([layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId]);
                spyOn(client, "_isPersistedSessionsDisabled").and.returnValue(true);
                client.__userId = "FrodoTheDodo";

                // Run
                client._authComplete({
                    session_token: "sessionToken"
                });

                // Posttest
                expect(localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId]).toBe(undefined);
            });
        });

        describe("The _clientAuthenticated() method", function () {

            it("Should set isAuthenticated", function () {
                // Pretest
                expect(client.isAuthenticated).toEqual(false);

                // Run
                client._clientAuthenticated();

                // Posttest
                expect(client.isAuthenticated).toEqual(true);

            });

            it("Should trigger 'authenticated'", function () {
                // Setup
                spyOn(client, "trigger");

                // Run
                client._clientAuthenticated();

                // Posttest
                expect(client.trigger).toHaveBeenCalledWith("authenticated");
            });

            it("Should call _clientReady if not isTrustedDevice", function () {
                // Setup
                spyOn(client, "_clientReady");

                // Run
                client._clientAuthenticated();

                // Posttest
                expect(client._clientReady).toHaveBeenCalled();
            });

            it("Should call _clientReady after DB open if isTrustedDevice", function () {
                // Setup
                var onOpen = layer.DbManager.prototype.onOpen;
                spyOn(layer.DbManager.prototype, "onOpen").and.callFake(function (callback) {
                    setTimeout(function () {
                        callback();
                    }, 10);
                });
                spyOn(client, "_clientReady");
                client.isTrustedDevice = true;

                // Run
                client._clientAuthenticated();
                expect(client._clientReady).not.toHaveBeenCalled();
                jasmine.clock().tick(11);

                // Posttest
                expect(client._clientReady).toHaveBeenCalled();

                // Cleanup
                layer.DbManager.prototype.onOpen = onOpen;
            });

            it("Should initialize the dbManager to all disabled if not isTrustedDevice", function () {
                // Setup
                client.isTrustedDevice = false;

                // Run
                client._clientAuthenticated();

                // Posttest
                expect(client.dbManager).toEqual(jasmine.any(layer.DbManager));
                expect(client.dbManager.tables).toEqual({
                    conversations: false,
                    messages: false,
                    identities: false,
                    syncQueue: false,
                    sessionToken: false
                });
            });

            it("Should initialize the dbManager to all disabled if not isTrustedDevice and persistenceFeatures provided", function () {
                // Setup
                client.isTrustedDevice = false;
                client.persistenceFeatures = {
                    conversations: true,
                    messages: true,
                    identities: true,
                    syncQueue: true,
                    sessionToken: true
                };

                // Run
                client._clientAuthenticated();

                // Posttest
                expect(client.dbManager).toEqual(jasmine.any(layer.DbManager));
                expect(client.dbManager.tables).toEqual({
                    conversations: false,
                    messages: false,
                    identities: false,
                    syncQueue: false,
                    sessionToken: false
                });
            });

            it("Should initialize the dbManager to all enabled if isTrustedDevice and no persistenceFeatures", function () {
                // Setup
                client.isTrustedDevice = true;

                // Run
                client._clientAuthenticated();

                // Posttest
                expect(client.dbManager).toEqual(jasmine.any(layer.DbManager));
                expect(client.dbManager.tables).toEqual({
                    conversations: true,
                    messages: true,
                    identities: true,
                    syncQueue: true,
                    sessionToken: true
                });
            });

            it("Should initialize the dbManager to custom values if isTrustedDevice and persistenceFeatures provided", function () {
                // Setup
                client.isTrustedDevice = true;
                client.persistenceFeatures = {
                    conversations: true,
                    messages: false,
                    identities: true,
                    syncQueue: false,
                    sessionToken: true
                };

                // Run
                client._clientAuthenticated();

                // Posttest
                expect(client.dbManager).toEqual(jasmine.any(layer.DbManager));
                expect(client.dbManager.tables).toEqual({
                    conversations: true,
                    messages: false,
                    identities: true,
                    syncQueue: false,
                    sessionToken: true
                });
            });

        });

        describe("The _authError() method", function () {
            it("Should trigger an error event", function () {
                // Setup
                spyOn(client, "trigger");
                var error = new layer.LayerError(responses.error1);

                // Run
                client._authError(error, identityToken);

                // Posttest
                expect(client.trigger).toHaveBeenCalledWith(
                    "authenticated-error", {
                        error: error
                    });
            });
        });

        describe("The _sessionTokenRestored() method", function () {

            it("Should trigger connected", function () {
                spyOn(client, "trigger");
                client._sessionTokenRestored([]);
                expect(client.trigger).toHaveBeenCalledWith("connected");
            });

            it("Should set isConnected", function () {
                expect(client.isConnected).toEqual(false);
                client._sessionTokenRestored([]);
                expect(client.isConnected).toEqual(true);
            });

            it("Should call _clientAuthenticated", function () {
                spyOn(client, "_clientAuthenticated");
                client._sessionTokenRestored([]);
                expect(client._clientAuthenticated).toHaveBeenCalledWith();
            });
        });

        describe("The _clientReady() method", function () {
            beforeEach(function() {
                client.isTrustedDevice = true;
                client._clientAuthenticated();
            });

            it("Should trigger ready", function () {
                spyOn(client, "trigger");
                client._clientReady();
                expect(client.trigger).toHaveBeenCalledWith('ready');
            });

            it("Should set isReady", function () {
                expect(client.isReady).toBe(false);
                client._clientReady();
                expect(client.isReady).toBe(true);
            });

            it("Should do nothing if already ready", function () {
                client.isReady = true;
                spyOn(client, "trigger");
                client._clientReady();
                expect(client.trigger).not.toHaveBeenCalled();
            });
        });

        describe("The logout() method", function () {
            it("Should not xhr if not authenticated", function () {
                // Setup
                client.isAuthenticated = false;
                spyOn(client, "xhr");

                // Run
                client.logout();

                // Posttest
                expect(client.xhr).not.toHaveBeenCalled();
            });

            it("Should call _resetSession even if not authenticated", function () {
                // Setup
                client.isAuthenticated = false;
                spyOn(client, "_resetSession");

                // Run
                client.logout();

                // Posttest
                expect(client._resetSession).toHaveBeenCalled();
            });

            it("Should call xhr DELETE if authenticated", function () {
                // Setup
                client.isAuthenticated = true;
                client.sessionToken = "sessionToken";
                spyOn(client, "xhr");

                // Run
                client.logout();

                // Posttest
                expect(client.xhr).toHaveBeenCalledWith({
                    method: "DELETE",
                    url: '/sessions/sessionToken'
                });
            });


            it("Should call _resetSession", function () {
                // Setup
                client.isAuthenticated = true;
                spyOn(client, "_resetSession");
                spyOn(client, "xhr");

                // Run
                client.logout();

                // Posttest
                expect(client._resetSession).toHaveBeenCalledWith();
            });

            it("Should call _clearStoredData", function () {
                // Setup
                spyOn(client, "_clearStoredData");

                // Run
                client.logout();

                // POsttest
                expect(client._clearStoredData).toHaveBeenCalledWith();
            });
        });

        describe("The _clearStoredData() method", function () {
            it("Should call deleteTables", function () {
                // Setup
                client._clientAuthenticated();
                spyOn(client.dbManager, "deleteTables");

                // Run
                client._clearStoredData();

                // Posttest
                expect(client.dbManager.deleteTables).toHaveBeenCalledWith();
            });

            it("Should clear localStorage", function () {
                // Setup
                localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId] = JSON.stringify({
                    userId: 'FrodoTheDodo',
                    sessionToken: 'fred',
                    expires: Date.now() + 10000000
                });

                // Run
                client._clearStoredData();

                // Posttest
                expect(localStorage[layer.Constants.LOCALSTORAGE_KEYS.SESSIONDATA + client.appId]).toBe(undefined);
            });
        });

        describe("The _resetSession() method", function () {


            it("Should clear the sessionToken", function () {
                client.sessionToken = "sessionToken";
                client._resetSession();
                expect(client.sessionToken).toEqual("");
            });

            it("Should clear isConnected", function () {
                client.isConnected = true;
                client._resetSession();
                expect(client.isConnected).toEqual(false);
            });

            it("Should clear isAuthenticated", function () {
                client.isAuthenticated = true;
                client._resetSession();
                expect(client.isAuthenticated).toEqual(false);
            });

            it("Should clear isReady", function () {
                client.isReady = true;
                client._resetSession();
                expect(client.isReady).toEqual(false);
            });

            it("Should trigger authenticated-expired", function () {
                spyOn(client, "trigger");
                client._resetSession();
                expect(client.trigger).toHaveBeenCalledWith("deauthenticated");
            });

            it("Should call onlineManager.stop()", function () {
                spyOn(client.onlineManager, "stop");
                client._resetSession();
                expect(client.onlineManager.stop).toHaveBeenCalledWith();
            });
        });

        describe("Property Adjuster Methods", function () {
            it("Should not be possible to change appIds while connected", function () {
                client.appId = "appId1";
                client.isConnected = true;
                expect(function () {
                    client.appId = "appId2";
                }).toThrowError(layer.LayerError.dictionary.cantChangeIfConnected);
                expect(layer.LayerError.dictionary.cantChangeIfConnected.length > 0).toBe(true);
            });

            it("Should not be possible to change userIds while connected", function () {
                client.userId = "userId1";
                client.isConnected = true;
                expect(function () {
                    client.userId = "userId2";
                }).toThrowError(layer.LayerError.dictionary.cantChangeIfConnected);
            });
        });

        describe("The _handleOnlineChange() method", function () {
            it("Should trigger online: false if disconnected", function () {
                client.isAuthenticated = true;
                spyOn(client, "trigger");
                client._handleOnlineChange({
                    eventName: 'disconnected'
                });

                expect(client.trigger).toHaveBeenCalledWith('online', { isOnline: false });
            });

            it("Should trigger online: true if connected", function () {
                client.isAuthenticated = true;
                spyOn(client, "trigger");
                client._handleOnlineChange({
                    eventName: 'connected',
                    offlineDuration: 500
                });

                expect(client.trigger).toHaveBeenCalledWith('online', { isOnline: true, reset: false });
            });

            it("Should trigger reset: true if connected after 30 hours offline", function () {
                client.isAuthenticated = true;
                spyOn(client, "trigger");
                client._handleOnlineChange({
                    eventName: 'connected',
                    offlineDuration: 1000 * 60 * 60 * 31
                });

                expect(client.trigger).toHaveBeenCalledWith('online', { isOnline: true, reset: true });
            });

            it("Should not trigger if not authenticated", function () {
                client.isAuthenticated = false;
                spyOn(client, "trigger");
                client._handleOnlineChange({
                    eventName: 'connected',
                    offlineDuration: 1000 * 60 * 60 * 31
                });

                expect(client.trigger).not.toHaveBeenCalled();

            });
        });

        describe("Untested Methods", function () {
            xit("SHould have a test for _clientReady", function () { });
        });

        describe("The isOnline property getter", function () {

            it("Should return the onlineState's online state", function () {
                client.onlineManager.isOnline = "fred";
                expect(client.isOnline).toEqual("fred");
            });

        });

        describe("The logLevel property setter", function () {

            it("Should update the loggers level", function () {
                client.logLevel = 100;
                expect(client.logLevel).toEqual(100);
                client.logLevel = 0;
            });
        });

        describe("The _destroyComponents() method", function () {

            it("Should destroy dbManager", function () {
                client._clientAuthenticated();
                var dbManager = client.dbManager;
                client._destroyComponents();
                expect(dbManager.isDestroyed).toBe(true);
            });
        });
    });
});
