/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {
    'use strict';
    
    var FileSystem = brackets.getModule('filesystem/FileSystem');
    
    var Utils = {};
    var i;
    var debugOutput = false;
    
    Utils.setDebugOutput = function (flag) {
        debugOutput = flag;
    };
    Utils.log = function (msg) {
        if (debugOutput) {
            if (arguments.length > 1) {
                console.log(Array.prototype.join.call(arguments, ' '));
            } else {
                console.log(msg);
            }
        }
    };
    
    Utils.bindFnc = function (object, fnc) {
        return function () {
            fnc.apply(object, arguments);
        };
    };
    
    /**
     * Asynchronously gets a FileSystemEntry instance from an absolute path.
     * @param {!string} path The absolute path.
     * @return {$.Promise} a jQuery promise that will be resolved with the
     * FileSystemEntry and FileSystemStats, or rejected with a FileSystemError
     * string constant.
     */
    Utils.fileEntryFromPath = function (path) {
        var $result = new $.Deferred();
        
        FileSystem.resolve(path, function (err, entry, stats) {
            if (!err) {
                Utils.log('Utils.fileEntryFromPath: resolving ' + entry.fullPath + '.');
                $result.resolve(entry, stats);
            } else {
                $result.reject(err);
            }
        });
        
        return $result.promise();
    };
    
    for (i in Utils) {
        if (Utils.hasOwnProperty(i)) {
            exports[i] = Utils[i];
        }
    }
});