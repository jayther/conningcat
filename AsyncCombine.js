/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {
    'use strict';
    
    var FileSystem = brackets.getModule('filesystem/FileSystem'),
        FileUtils = brackets.getModule('file/FileUtils'),
        Async = brackets.getModule('utils/Async'),
        Utils = require('Utils');
    
    function AsyncCombine(options) {
        var opts = options || {};
        this.outputFilePath = opts.outputFilePath;
        this.filePaths = opts.filePaths;
        this.finishCallback = opts.finishCallback;
        this.interruptCallback = opts.interruptCallback;
        this.appendNewLine = opts.appendNewLine;
        this.strict = opts.strict || false;
        
        this.interrupted = false;
        this.finished = false;
        
        this.output = '';
        
        this.filesRead = 0;
        
        this.promiseQueue = new Async.PromiseQueue();
        
        this.bindedFileLoaded = Utils.bindFnc(this, this.fileLoaded);
        this.bindedFileError = Utils.bindFnc(this, this.fileError);
        
        this.init();
    }
    AsyncCombine.prototype = {
        init: function () {
            var self = this;
            this.filePaths.forEach(function (value, index) {
                Utils.log('AsyncCombine: adding promise for fileEntry from ' + value + '.');
                this.promiseQueue.add(function () {
                    Utils.log('AsyncCombine: fileEntry from ' + value + '.');
                    var promise = Utils.fileEntryFromPath(value);
                    promise.done(function (entry, stats) {
                        self.fileLoaded(entry);
                        Utils.log('AsyncCombine: fileLoaded ' + entry.fullPath + '.');
                    });
                    promise.fail(function (err) {
                        self.fileError(value + ' ' + err);
                    });
                    return promise;
                });
            }, this);
            Utils.log('AsyncCombine initted');
        },
        interrupt: function (reason) {
            this.promiseQueue.removeAll();
            this.interrupted = true;
            if (this.interruptCallback) {
                this.interruptCallback(reason);
            }
        },
        fileLoaded: function (entry) {
            if (!this.interrupted) {
                var self = this;
                Utils.log('AsyncCombine: adding promise to read ' + entry.fullPath + ' as text.');
                this.promiseQueue.add(function () {
                    Utils.log('AsyncCombine: reading ' + entry.fullPath + ' as text.');
                    var promise = FileUtils.readAsText(entry);
                    promise.done(Utils.bindFnc(self, self.appendToOutput));
                    return promise;
                });
            }
        },
        fileError: function (err) {
            Utils.log('AsyncCombine: ' + err);
            if (!this.interrupted) {
                if (this.strict) {
                    this.interrupt(err);
                } else {
                    this.filesRead += 1;
                }
            }
        },
        appendToOutput: function (text) {
            if (!this.interrupted) {
                Utils.log('AsyncCombine: appending "' + text.substring(0, 20) + '..."');
                this.output += text;
                if (this.appendNewLine) {
                    this.output += (FileUtils.getPlatformLineEndings() === FileUtils.LINE_ENDINGS_CRLF ? "\r\n" : "\n");
                }
                this.filesRead += 1;
                if (this.filesRead >= this.filePaths.length) {
                    this.post();
                }
            }
        },
        post: function () {
            if (!this.finished && !this.interrupted && this.finishCallback) {
                this.finished = true;
                this.finishCallback(this.output);
            }
        }
    };
    
    module.exports = AsyncCombine;
});