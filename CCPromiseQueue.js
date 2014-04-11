/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {
    'use strict';
    
    var Async = brackets.getModule('utils/Async');
    
    /**
     * CCPromiseQueue. A fixed Async.PromiseQueue.
     */
    function CCPromiseQueue() {
        Async.PromiseQueue.apply(this, arguments);
        //defining in instance (some issues with proper order of execution if not defined in instance).
        this._queue = [];
        this._curPromise = null;
    }
    
    CCPromiseQueue.prototype = Object.create(Async.PromiseQueue.prototype);
    
    CCPromiseQueue.prototype._doNext = function () {
        var self = this;
        if (this._queue.length) {
            var op = this._queue.shift();
            this._curPromise = op();
            this._curPromise.always(function () {
                self._curPromise = null;
                self._doNext();
            });
        }
    };
    
    module.exports = CCPromiseQueue;
});