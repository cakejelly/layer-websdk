/**
 * @class  layer.SyncManager
 * @extends layer.Root
 * @protected
 *
 * This class manages
 *
 * 1. a queue of requests that need to be made
 * 2. when a request should be fired, based on authentication state, online state, websocket connection state, and position in the queue
 * 3. when a request should be aborted
 * 4. triggering any request callbacks
 *
 * TODO WEB-850: Currently the sync queue is managed solely in runtime memory.  But the queue should be stored
 * in persistent memory so that a tab-reload can restore the queue without losing commands that the user has
 * been told have been accepted.
 *
 * TODO: In the event of a DNS error, we may have a valid websocket receiving events and telling us we are online,
 * and be unable to create a REST call.  This will be handled wrong because evidence will suggest that we are online.
 * This issue goes away when we use bidirectional websockets for all requests.
 *
 * Applications do not typically interact with this class, but may subscribe to its events
 * to get richer detailed information than is available from the layer.Client instance.
 */
const Root = require('./root');
const { WebsocketSyncEvent } = require('./sync-event');
const xhr = require('./xhr');
const logger = require('./logger');
const Utils = require('./client-utils');

class SyncManager extends Root {
  /**
   * Creates a new SyncManager.
   *
   * An Application is expected to only have one SyncManager.
   *
   *      var socketManager = new layer.Websockets.SocketManager({client: client});
   *      var requestManager = new layer.Websockets.RequestManager({client: client, socketManager: socketManager});
   *
   *      var onlineManager = new layer.OnlineManager({
   *          socketManager: socketManager
   *      });
   *
   *      // Now we can instantiate this thing...
   *      var SyncManager = new layer.SyncManager({
   *          client: client,
   *          onlineManager: onlineManager,
   *          socketManager: socketManager,
   *          requestManager: requestManager
   *      });
   *
   * @method constructor
   * @param  {Object} options
   * @param {layer.OnlineStateManager} options.onlineManager
   * @param {layer.Websockets.RequestManager} options.requestManager
   * @param {layer.Client} options.client
   */
  constructor(options) {
    super(options);
    this.client = options.client;

    // Note we do not store a pointer to client... it is not needed.
    if (this.client) {
      this.client.on('ready', () => {
        this._processNextRequest();
        this._loadPersistedQueue();
      }, this);
    }
    this.queue = [];

    this.onlineManager.on('disconnected', this._onlineStateChange, this);
    this.socketManager.on('connected disconnected', this._onlineStateChange, this);
  }

  isOnline() {
    return this.onlineManager.isOnline;
  }

  /**
   * Process sync request when connection is restored.
   *
   * Any time we go back online (as signaled by the onlineStateManager),
   * Process the next Sync Event (will do nothing if one is already firing)
   *
   * @method _onlineStateChange
   * @private
   * @param  {string} evtName - 'connected' or 'disconnected'
   * @param  {layer.LayerEvent} evt
   */
  _onlineStateChange(evt) {
    if (evt.eventName === 'connected') {
      if (this.queue.length) this.queue[0].returnToOnlineCount++;
      setTimeout(() => this._processNextRequest(), 100);
    } else if (evt.eventName === 'disconnected') {
      if (this.queue.length) {
        this.queue[0].isFiring = false;
      }
    }
  }

  /**
   * Adds a new xhr request to the queue.
   *
   * If the queue is empty, this will be fired immediately.
   * If the queue is non-empty, this will wait until all other requests in the queue have been fired.
   *
   * @method request
   * @param  {layer.SyncEvent} requestEvt - A SyncEvent specifying the request to be made
   */
  request(requestEvt) {
    // If its a PATCH request on an object that isn't yet created,
    // do not add it to the queue.
    if (requestEvt.operation !== 'PATCH' || !this._findUnfiredCreate(requestEvt)) {
      logger.info(`Sync Manager Request ${requestEvt.operation} on target ${requestEvt.target}`);
      logger.debug(requestEvt.toObject());
      this.queue.push(requestEvt);
      this.trigger('sync:add', {
        request: requestEvt,
        target: requestEvt.target,
      });
    } else {
      logger.info(`Sync Manager Request PATCH ${requestEvt.target} request ignored; create request still enqueued`);
      logger.debug(requestEvt.toObject());
    }

    // If its a DELETE request, purge all other requests on that target.
    if (requestEvt.operation === 'DELETE') {
      this._purgeOnDelete(requestEvt);
    }

    // Fire the request if there aren't any existing requests already being processed.
    // If this isn't the first item, assume that all necessary logic exists to fire the
    // existing requests and then it will move onto this request.
    if (this.queue.length === 1) {
      this._processNextRequest();
    }
  }

  /**
   * Find create request for this resource.
   *
   * Determine if the given target has a POST request waiting to create
   * the resource, and return any matching requests. Used
   * for folding PATCH requests into an unfired CREATE/POST request.
   *
   * @method _findUnfiredCreate
   * @private
   * @param  {layer.SyncEvent} requestEvt
   * @return {Boolean}
   */
  _findUnfiredCreate(requestEvt) {
    return Boolean(this.queue.filter(evt =>
      evt.target === requestEvt.target && evt.operation === 'POST' && !evt.isFiring).length
    );
  }

  /**
   * Process the next request in the queue.
   *
   * Request is dequeued on completing the process.
   * If the first request in the queue is firing, do nothing.
   *
   * @method _processNextRequest
   * @private
   */
  _processNextRequest() {
    if (this.isDestroyed) return;
    const requestEvt = this.queue[0];
    if (this.isOnline() && requestEvt && !requestEvt.isFiring) {
      if (requestEvt instanceof WebsocketSyncEvent) {
        if (this.socketManager && this.socketManager._isOpen()) {
          logger.debug(`Sync Manager Websocket Request Firing ${requestEvt.operation} on target ${requestEvt.target}`,
            requestEvt.toObject());
          this.requestManager.sendRequest(requestEvt._getRequestData(this.client),
              result => this._xhrResult(result, requestEvt));
          requestEvt.isFiring = true;
        } else {
          logger.debug('Sync Manager Websocket Request skipped; socket closed');
        }
      } else {
        logger.debug(`Sync Manager XHR Request Firing ${requestEvt.operation} ${requestEvt.target}`,
          requestEvt.toObject());
        xhr(requestEvt._getRequestData(this.client), result => this._xhrResult(result, requestEvt));
        requestEvt.isFiring = true;
      }
    } else if (requestEvt && requestEvt.isFiring) {
      logger.debug(`Sync Manager processNext skipped; request still firing ${requestEvt.operation} ` +
        `on target ${requestEvt.target}`, requestEvt.toObject());
    }
  }

  /**
   * Process the result of an xhr call, routing it to the appropriate handler.
   *
   * @method _xhrResult
   * @private
   * @param  {Object} result  - Response object returned by xhr call
   * @param  {layer.SyncEvent} requestEvt - Request object
   */
  _xhrResult(result, requestEvt) {
    result.request = requestEvt;
    requestEvt.isFiring = false;
    if (!result.success) {
      this._xhrError(result);
    } else {
      this._xhrSuccess(result);
    }
  }

  /**
   * Categorize the error for handling.
   *
   * @method _getErrorState
   * @private
   * @param  {Object} result  - Response object returned by xhr call
   * @param  {layer.SyncEvent} requestEvt - Request object
   * @param  {boolean} isOnline - Is our app state set to online
   */
  _getErrorState(result, requestEvt, isOnline) {
    if (!isOnline) {
      // CORS errors look identical to offline; but if our online state has transitioned from false to true repeatedly while processing this request,
      // thats a hint that that its a CORS error
      if (requestEvt.returnToOnlineCount >= SyncManager.MAX_RETRIES_BEFORE_CORS_ERROR) {
        return 'CORS';
      } else {
        return 'offline';
      }
    } else if (result.status === 404 && result.data && result.data.code === 102) {
      return 'notFound';
    } else if (result.status === 408) {
      if (requestEvt.retryCount >= SyncManager.MAX_RETRIES) {
        return 'tooManyFailuresWhileOnline';
      } else {
        return 'validateOnlineAndRetry';
      }
    } else if ([502, 503, 504].indexOf(result.status) !== -1) {
      if (requestEvt.retryCount >= SyncManager.MAX_RETRIES) {
        return 'tooManyFailuresWhileOnline';
      } else {
        return 'serverUnavailable';
      }
    } else if (result.status === 401 && result.data.data && result.data.data.nonce) {
      return 'reauthorize';
    } else {
      return 'serverRejectedRequest';
    }
  }

  /**
   * Handle failed requests.
   *
   * 1. If there was an error from the server, then the request has problems
   * 2. If we determine we are not in fact online, call the connectionError handler
   * 3. If we think we are online, verify we are online and then determine how to handle it.
   *
   * @method _xhrError
   * @private
   * @param  {Object} result  - Response object returned by xhr call
   * @param  {layer.SyncEvent} requestEvt - Request object
   */
  _xhrError(result) {
    const requestEvt = result.request;

    logger.warn(`Sync Manager ${requestEvt instanceof WebsocketSyncEvent ? 'Websocket' : 'XHR'} ` +
      `${requestEvt.operation} Request on target ${requestEvt.target} has Failed`, requestEvt.toObject());

    const errState = this._getErrorState(result, requestEvt, this.isOnline());
    logger.warn('Sync Manager Error State: ' + errState);
    switch (errState) {
      case 'tooManyFailuresWhileOnline':
        this._xhrHandleServerError(result, 'Sync Manager Server Unavailable Too Long; removing request');
        break;
      case 'notFound':
        this._xhrHandleServerError(result, 'Resource not found; presumably deleted');
        break;
      case 'validateOnlineAndRetry':
        // Server appears to be hung but will eventually recover.
        // Retry a few times and then error out.
        this._xhrValidateIsOnline();
        break;
      case 'serverUnavailable':
        // Server is in a bad state but will eventually recover;
        // keep retrying.
        this._xhrHandleServerUnavailableError(requestEvt);
        break;
      case 'reauthorize':
        // sessionToken appears to no longer be valid; forward response
        // on to client-authenticator to process.
        // Do not retry nor advance to next request.
        if (requestEvt.callback) requestEvt.callback(result);

        break;
      case 'serverRejectedRequest':
        // Server presumably did not like the arguments to this call
        // or the url was invalid.  Do not retry; trigger the callback
        // and let the caller handle it.
        this._xhrHandleServerError(result, 'Sync Manager Server Rejects Request; removing request');
        break;
      case 'CORS':
        // A pattern of offline-like failures that suggests its actually a CORs error
        this._xhrHandleServerError(result, 'Sync Manager Server detects CORS-like errors; removing request');
        break;
      case 'offline':
        this._xhrHandleConnectionError();
        break;
    }
  }

  /**
   * Handle a server unavailable error.
   *
   * In the event of a 502 (Bad Gateway), 503 (service unavailable)
   * or 504 (gateway timeout) error from the server
   * assume we have an error that is self correcting on the server.
   * Use exponential backoff to retry the request.
   *
   * Note that each call will increment retryCount; there is a maximum
   * of MAX_RETRIES before it is treated as an error
   *
   * @method  _xhrHandleServerUnavailableError
   * @private
   * @param {layer.SyncEvent} request
   */
  _xhrHandleServerUnavailableError(request) {
    const maxDelay = SyncManager.MAX_UNAVAILABLE_RETRY_WAIT;
    const delay = Utils.getExponentialBackoffSeconds(maxDelay, Math.min(15, request.retryCount++));
    logger.warn(`Sync Manager Server Unavailable; retry count ${request.retryCount}; retrying in ${delay} seconds`);
    setTimeout(this._processNextRequest.bind(this), delay * 1000);
  }

  /**
   * Handle a server error in response to firing sync event.
   *
   * If there is a server error, its presumably non-recoverable/non-retryable error, so
   * we're going to abort this request.
   *
   * 1. If a callback was provided, call it to handle the error
   * 2. If a rollback call is provided, call it to undo any patch/delete/etc... changes
   * 3. If the request was to create a resource, remove from the queue all requests
   *    that depended upon that resource.
   * 4. Advance to next request
   *
   * @method _xhrHandleServerError
   * @private
   * @param  {Object} result  - Response object returned by xhr call
   *
   */
  _xhrHandleServerError(result, logMsg) {
    // Execute all callbacks provided by the request
    if (result.request.callback) result.request.callback(result);
    logger.error(logMsg, result.request);
    this.trigger('sync:error', {
      target: result.request.target,
      request: result.request,
      error: result.data,
    });

    result.request.success = false;

    // If a POST request fails, all requests that depend upon this object
    // must be purged
    if (result.request.operation === 'POST') {
      this._purgeDependentRequests(result.request);
    }

    // Remove this request as well (side-effect: rolls back the operation)
    this._removeRequest(result.request);

    // And finally, we are ready to try the next request
    this._processNextRequest();
  }

  /**
   * If there is a connection error, wait for retry.
   *
   * In the event of what appears to be a connection error,
   * Wait until a 'connected' event before processing the next request (actually reprocessing the current event)
   *
   * @method _xhrHandleConnectionError
   * @private
   */
  _xhrHandleConnectionError() {
    // Nothing to be done; we already have the below event handler setup
    // this.onlineManager.once('connected', () => this._processNextRequest());
  }

  /**
   * Verify that we are online and retry request.
   *
   * This method is called when we think we're online, but
   * have determined we need to validate that assumption.
   *
   * Test that we have a connection; if we do,
   * retry the request once, and if it fails again,
   * _xhrError() will determine it to have failed and remove it from the queue.
   *
   * If we are offline, then let _xhrHandleConnectionError handle it.
   *
   * @method _xhrValidateIsOnline
   * @private
   */
  _xhrValidateIsOnline() {
    logger.debug('Sync Manager verifying online state');
    this.onlineManager.checkOnlineStatus(isOnline => this._xhrValidateIsOnlineCallback(isOnline));
  }

  /**
   * If we have verified we are online, retry request.
   *
   * We should have received a response to our /nonces call
   * which assuming the server is actually alive,
   * will tell us if the connection is working.
   *
   * If we are offline, flag us as offline and let the ConnectionError handler handle this
   * If we are online, give the request a single retry (there is never more than one retry)
   *
   * @method _xhrValidateIsOnlineCallback
   * @private
   * @param  {boolean} isOnline  - Response object returned by xhr call
   */
  _xhrValidateIsOnlineCallback(isOnline) {
    logger.debug('Sync Manager online check result is ' + isOnline);
    if (!isOnline) {
      // Treat this as a Connection Error
      this._xhrHandleConnectionError();
    } else {
      // Retry the request in case we were offline, but are now online.
      // Of course, if this fails, give it up entirely.
      this.queue[0].retryCount++;
      this._processNextRequest();
    }
  }

  /**
   * The XHR request was successful.
   *
   * Any xhr request that actually succedes:
   *
   * 1. Remove it from the queue
   * 2. Call any callbacks
   * 3. Advance to next request
   *
   * @method _xhrSuccess
   * @private
   * @param  {Object} result  - Response object returned by xhr call
   * @param  {layer.SyncEvent} requestEvt - Request object
   */
  _xhrSuccess(result) {
    const requestEvt = result.request;
    logger.debug(`Sync Manager ${requestEvt instanceof WebsocketSyncEvent ? 'Websocket' : 'XHR'} ` +
      `${requestEvt.operation} Request on target ${requestEvt.target} has Succeeded`, requestEvt.toObject());
    if (result.data) logger.debug(result.data);
    requestEvt.success = true;
    this._removeRequest(requestEvt);
    if (requestEvt.callback) requestEvt.callback(result);
    this._processNextRequest();

    this.trigger('sync:success', {
      target: requestEvt.target,
      request: requestEvt,
      response: result.data,
    });
  }

  /**
   * Remove the SyncEvent request from the queue.
   *
   * @method _removeRequest
   * @private
   * @param  {layer.SyncEvent} requestEvt - SyncEvent Request to remove
   */
  _removeRequest(requestEvt) {
    const index = this.queue.indexOf(requestEvt);
    if (index !== -1) this.queue.splice(index, 1);
  }

  /**
   * Remove requests from queue that depend on specified resource.
   *
   * If there is a POST request to create a new resource, and there are PATCH, DELETE, etc...
   * requests on that resource, if the POST request fails, then all PATCH, DELETE, etc
   * requests must be removed from the queue.
   *
   * Note that we do not call the rollback on these dependent requests because the expected
   * rollback is to destroy the thing that was created, which means any other rollback has no effect.
   *
   * @method _purgeDependentRequests
   * @private
   * @param  {layer.SyncEvent} request - Request whose target is no longer valid
   */
  _purgeDependentRequests(request) {
    this.queue = this.queue.filter(evt => evt.depends.indexOf(request.target) === -1 || evt === request);
  }


  /**
   * Remove from queue all events that operate upon the deleted object.
   *
   * @method _purgeOnDelete
   * @private
   * @param  {layer.SyncEvent} evt - Delete event that requires removal of other events
   */
  _purgeOnDelete(evt) {
    this.queue.filter(request => request.depends.indexOf(evt.target) !== -1 && evt !== request).forEach(requestEvt => {
      this.trigger('sync:abort', {
        target: requestEvt.target,
        request: requestEvt,
      });
      this._removeRequest(requestEvt);
    });
  }


  destroy() {
    this.queue.forEach(evt => evt.destroy());
    this.queue = null;
    super.destroy();
  }


  _loadPersistedQueue() {
    this.client.dbManager.loadSyncQueue(data => {
      if (data.length) {
        this.queue = this.queue.concat(data);
        this._processNextRequest();
      }
    });
  }
}

/**
 * Websocket Manager for getting socket state.
 * @type {layer.Websockets.SocketManager}
 */
SyncManager.prototype.socketManager = null;

/**
 * Websocket Request Manager for sending requests.
 * @type {layer.Websockets.RequestManager}
 */
SyncManager.prototype.requestManager = null;

/**
 * Reference to the Online State Manager.
 *
 * Sync Manager uses online status to determine if it can fire sync-requests.
 * @private
 * @type {layer.OnlineStateManager}
 */
SyncManager.prototype.onlineManager = null;

/**
 * The array of layer.SyncEvent instances awaiting to be fired.
 * @type {layer.SyncEvent[]}
 */
SyncManager.prototype.queue = null;

/**
 * Reference to the Client so that we can pass it to SyncEvents  which may need to lookup their targets
 */
SyncManager.prototype.client = null;

/**
 * Maximum exponential backoff wait.
 *
 * If the server is returning 502, 503 or 504 errors, exponential backoff
 * should never wait longer than this number of seconds (15 minutes)
 * @type {Number}
 * @static
 */
SyncManager.MAX_UNAVAILABLE_RETRY_WAIT = 60 * 15;

/**
 * Retries before suspect CORS error.
 *
 * How many times can we transition from offline to online state
 * with this request at the front of the queue before we conclude
 * that the reason we keep thinking we're going offline is
 * a CORS error returning a status of 0.  If that pattern
 * shows 3 times in a row, there is likely a CORS error.
 * Note that CORS errors appear to javascript as a status=0 error,
 * which is the same as if the client were offline.
 * @type {number}
 * @static
 */
SyncManager.MAX_RETRIES_BEFORE_CORS_ERROR = 3;

/**
 * Abort request after this number of retries.
 *
 * @type {number}
 * @static
 */
SyncManager.MAX_RETRIES = 20;


SyncManager._supportedEvents = [
  /**
   * A sync request has failed.
   *
   * @event
   * @param {layer.SyncEvent} evt - The request object
   * @param {Object} result
   * @param {string} result.target - ID of the message/conversation/etc. being operated upon
   * @param {layer.SyncEvent} result.request - The original request
   * @param {Object} result.error - The error object {id, code, message, url}
   */
  'sync:error',

  /**
   * A sync layer request has completed successfully.
   *
   * @event
   * @param {Object} result
   * @param {string} result.target - ID of the message/conversation/etc. being operated upon
   * @param {layer.SyncEvent} result.request - The original request
   * @param {Object} result.data - null or any data returned by the call
   */
  'sync:success',

  /**
   * A new sync request has been added.
   *
   * @event
   * @param {layer.SyncEvent} evt - The request object
   */
  'sync:add',

  /**
   * A sync request has been canceled.
   *
   * Typically caused by a new SyncEvent that deletes the target of this SyncEvent
   *
   * @event
   * @param {layer.SyncEvent} evt - The request object
   * @param {Object} result
   * @param {string} result.target - ID of the message/conversation/etc. being operated upon
   * @param {layer.SyncEvent} result.request - The original request
   */
  'sync:abort',
].concat(Root._supportedEvents);

Root.initClass(SyncManager);
module.exports = SyncManager;
