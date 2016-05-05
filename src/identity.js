/*
1. As part of initialization, load the authenticated user’s full Identity record so that the Client knows more than just the `userId` of its user. Might be nice to add this to the response to `POST /sessions` but this works. Also loads it from DB if available. DONE.
2. Any time we get a `message.sender` object see if we have an Identity for that sender, and if not create one using the data provided by `message.sender`.  This allows all Messages that share a sender to share a single object. DONE
3. Sharing a single object also means websocket updates to Identity can be available to everyone with the pointer to that Identity
4. I’m creating an Identity class, with UserIdentity and ServiceIdentity as subclasses; Identity will have `displayName`; UserIdentity will have `first_name`, `last_name`, etc…; ServiceIdentity will have `name` (Admin, Moderator, etc…).
5. In creating UserIdentity instances from `message.sender` I’m generating an `id` from the `user_id` using `layer:///identities/` + user_id
6. In creating ServiceIdentity instances from `message.sender` I’m generating an `id` from the `name` using `layer:///serviceidentities/` + name
7. The Query API supports querying and paging through Identities
8. Any full Identity loaded via Query API will also update the Client’s cache of Identities, and flesh out any missing fields.
9. Conversation.participants I don’t yet have a plan for; initial thoughts:
A. Conversation.participants remains an array of `user_id` strings
B. Add a method for fetching all Identities for the `participants`; this will gather all cached Identities, and load any missing Identities from the server.  We may have Conversations where we haven’t yet loaded any Messages and therefore don’t have a pool of `sender` values populated with participant Identities.
10. When available, persistence should smooth a lot of this out.

* Generalize the UserIdentity.load method
*/

const Syncable = require('./syncable');
const Root = require('./root');
const Constants = require('./const');
const LayerError = require('./layer-error');

class Identity extends Syncable {
  constructor(options = {}) {
    // Make sure the ID from handle fromServer parameter is used by the Root.constructor
    if (options.fromServer) options.id = options.fromServer.id;

    // Make sure we have an clientId property
    if (options.client) options.clientId = options.client.appId;

    super(options);

    this.isInitializing = true;

    // If the options contains a full server definition of the object,
    // copy it in with _populateFromServer; this will add the Conversation
    // to the Client as well.
    if (options && options.fromServer) {
      this._populateFromServer(options.fromServer);
    }

    this.localCreatedAt = new Date();
    this.isInitializing = false;
  }
}

Identity.prototype.id = '';
Identity.prototype.displayName = '';
Identity.prototype.localCreatedAt = null;
Identity.prototype.sessionOwner = false;
Identity.prototype.clientId = '';

Identity.inObjectIgnore = Root.inObjectIgnore;

Identity.bubbleEventParent = 'getClient';

Root.initClass.apply(Identity, [Identity, 'Identity']);


class UserIdentity extends Identity {
  /**
   * Populates this instance using server-data.
   *
   * Side effects add this to the Client.
   *
   * @method _populateFromServer
   * @private
   * @param  {Object} identity - Server representation of the identity
   */
  _populateFromServer(identity) {
    const client = this.getClient();

    // Disable events if creating a new Identity
    // We still want property change events for anything that DOES change
    this._disableEvents = (this.syncState === Constants.SYNC_STATE.NEW);

    this._setSynced();

    this.id = identity.id;
    this.url = identity.url;
    this.userId = identity.user_id;
    this.avatarUrl = identity.avatar_url;
    this.displayName = identity.display_name;
    this.emailAddress = identity.email_address;
    this.lastName = identity.last_name;
    this.firstName = identity.first_name;
    this.metadata = identity.metadata;
    this.publicKey = identity.public_key;
    this.phoneNumber = identity.phone_number;

    client._addIdentity(this);
    this._disableEvents = false;
  }


  _loaded(data) {
    this.getClient()._addIdentity(this);
  }

  static _createFromServer(identity, client) {
    return new UserIdentity({
      client,
      fromServer: identity,
      _fromDB: identity._fromDB,
    });
  }

  // TODO: Generalize this to all Syncable classes
  static load(id, client) {
    if (!client || !(client instanceof Root)) throw new Error(LayerError.dictionary.clientMissing);
    const obj = {
      id,
      url: client.url + id.substring(8),
      clientId: client.appId,
    };
    const item = new UserIdentity(obj);

    client.dbManager.getObjects('identities', [id], (identities) => {
      if (identities.length) {
        item._populateFromServer(identities[0]);
        item.trigger('identities:loaded');
      } else {
        item._load();
      }
    });

    return item;
  }
}

UserIdentity.prototype.url = '';
UserIdentity.prototype.userId = '';
UserIdentity.prototype.avatarUrl = '';
UserIdentity.prototype.firstName = '';
UserIdentity.prototype.lastName = '';
UserIdentity.prototype.emailAddress = '';
UserIdentity.prototype.phoneNumber = '';
UserIdentity.prototype.metadata = null;
UserIdentity.prototype.publicKey = '';

UserIdentity.inObjectIgnore = Identity.inObjectIgnore;

UserIdentity.bubbleEventParent = 'getClient';

UserIdentity._supportedEvents = [
  'identities:loaded',
  'identities:loaded-error',
];

UserIdentity.eventPrefix = 'identities';
UserIdentity.prefixUUID = 'layer:///identities/';

Root.initClass.apply(UserIdentity, [UserIdentity, 'UserIdentity']);
Syncable.subclasses.push(UserIdentity);

class ServiceIdentity extends Identity {
  /**
   * Populates this instance using server-data.
   *
   * Side effects add this to the Client.
   *
   * @method _populateFromServer
   * @private
   * @param  {Object} identity - Server representation of the identity
   */
  _populateFromServer(identity) {
    const client = this.getClient();

    // Disable events if creating a new Identity
    // We still want property change events for anything that DOES change
    this._disableEvents = (this.syncState === Constants.SYNC_STATE.NEW);

    this._setSynced();

    this.id = identity.id;
    this.url = identity.url;
    this.name = identity.name;
    this.displayName = identity.name;

    client._addIdentity(this);
    this._disableEvents = false;
  }

  static _createFromServer(identity, client) {
    return new ServiceIdentity({
      client,
      fromServer: identity,
      _fromDB: identity._fromDB,
    });
  }
}

ServiceIdentity.prototype.name = '';

ServiceIdentity._supportedEvents = [
  'identities:loaded',
  'identities:loaded-error',
];

ServiceIdentity.eventPrefix = 'serviceidentities';

ServiceIdentity.prefixUUID = 'layer:///serviceidentities/';

Root.initClass.apply(ServiceIdentity, [ServiceIdentity, 'ServiceIdentity']);
Syncable.subclasses.push(ServiceIdentity);

module.exports = {
  Identity,
  UserIdentity,
  ServiceIdentity,
};
