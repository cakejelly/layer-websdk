const Syncable = require('./syncable');
const Root = require('./root');
const Constants = require('./const');


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
    // If the Identity already exists in cache, update the cache
    return new Identity({
      client,
      fromServer: identity,
      _fromDB: identity._fromDB,
    });
  }
}

Identity.prototype.id = '';
Identity.prototype.url = '';
Identity.prototype.userId = '';
Identity.prototype.avatarUrl = '';
Identity.prototype.displayName = '';
Identity.prototype.firstName = '';
Identity.prototype.lastName = '';
Identity.prototype.emailAddress = '';
Identity.prototype.phoneNumber = '';
Identity.prototype.metadata = null;
Identity.prototype.publicKey = '';
Identity.prototype.name = '';
Identity.prototype.localCreatedAt = null;

Identity.prefixUUID = 'layer:///identities/';

Identity.inObjectIgnore = Root.inObjectIgnore;

Identity.bubbleEventParent = 'getClient';

Identity._supportedEvents = [
  'identities:add',
  'identities:change',
  'identities:remove',
  'identities:loaded',
  'identities:loaded-error',
];

Root.initClass.apply(Identity, [Identity, 'Identity']);
Syncable.subclasses.push(Identity);
module.exports = Identity;
