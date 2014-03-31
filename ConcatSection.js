/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {
    'use strict';
    
    var FileSystem = brackets.getModule('filesystem/FileSystem'),
        FileUtils = brackets.getModule('file/FileUtils'),
        ProjectManager = brackets.getModule('project/ProjectManager'),
        Async = brackets.getModule('utils/Async'),
        Utils = require('Utils'),
        AsyncCombine = require('AsyncCombine');
    
    function ConcatSection(options) {
        var opts = options || {};
        
        this.strict = opts.strict || false;
        
        this.files = opts.files;
        this.outputFilePath = opts.outputFilePath;
        this.appendNewLine = opts.appendNewLine || false;
        this.basePath = opts.basePath;
        
        this.filePaths = [];
        
        this.activeAsyncCombine = null;
        
        this.promiseQueue = new Async.PromiseQueue();
        
        this.bindedPostCombine = Utils.bindFnc(this, this.postCombine);
        this.bindedAddFile = Utils.bindFnc(this, this.addFile);
        this.bindedVisitAddFile = Utils.bindFnc(this, this.visitAddFile);
        this.bindedResolveAddFile = Utils.bindFnc(this, this.resolveAddFile);
        
        this.init();
    }
    ConcatSection.prototype = {
        init: function () {
            if (this.isValid()) {
                var self = this;
                var normalizedOutputFilePath = this.basePath + this.outputFilePath;
                normalizedOutputFilePath = normalizedOutputFilePath.replace('./', '');
                this.files.forEach(function (obj, i) {
                    var usePath = null, depth = 1;
                    
                    if (typeof obj === 'string') {
                        usePath = self.basePath + obj;
                    } else if (obj && typeof obj === 'object') {
                        if (obj.hasOwnProperty('recursive')) {
                            depth = obj.recursive ? 100 : 1;
                        }
                        if (obj.hasOwnProperty('maxDepth')) {
                            depth = obj.maxDepth;
                        }
                        if (obj.hasOwnProperty('directory')) {
                            usePath = self.basePath + obj.directory;
                        } else if (obj.hasOwnProperty('file')) {
                            usePath = self.basePath + obj.file;
                        }
                    }
                    if (usePath) {
                        usePath = usePath.replace('./', '');
                    }
                    //hardcoded this exclusion of the output file path so there won't be a continuous loop.
                    if (usePath && usePath.length > 0 && usePath !== normalizedOutputFilePath) {
                        self.promiseQueue.add(function () {
                            var promise = Utils.fileEntryFromPath(usePath);
                            promise.done(function (entry, stats) {
                                self.addFile(null, entry, stats, depth);
                            }).fail(function (err) {
                                self.addFile(usePath + ' ' + err);
                            });
                            return promise;
                        });
                    }
                }, this);
            }
        },
        addFile: function (err, entry, stats, depth) {
            //Utils.log('ConcatSection: added file.');
            if (err) {
                Utils.log('ConcatSection: ' + err);
            } else {
                if (entry.isFile) {
                    this.filePaths.push(entry.fullPath);
                } else if (entry.isDirectory) {
                    // TODO: how can we do a deterministic order?
                    entry.visit(
                        this.bindedVisitAddFile,
                        { maxDepth: depth || 1 }
                    );
                }
            }
        },
        resolveAddFile: function (err, entry, stats) {
            this.addFile(err, entry, stats);
        },
        visitAddFile: function (entry, depth) {
            this.addFile(null, entry, null, depth);
        },
        combine: function () {
            var self = this;
            if (this.activeAsyncCombine) {
                this.activeAsyncCombine.interrupt();
                this.activeAsyncCombine = null;
            }
            this.promiseQueue.add(function () {
                var $result = new $.Deferred();
                $result.done(self.bindedPostCombine);
                Utils.log('ConningCat: combining...');
                self.activeAsyncCombine = new AsyncCombine({
                    outputFilePath: self.outputFilePath,
                    filePaths: self.filePaths,
                    finishCallback: function (output) {
                        $result.resolve(output);
                    },
                    interruptCallback: function () {
                        $result.reject();
                    },
                    appendNewLine: self.appendNewLine,
                    strict: self.strict
                });
                return $result.promise();
            });
        },
        postCombine: function (output) {
            Utils.log('ConningCat: output.length: ' + output.length);
            var usePath = this.basePath + this.outputFilePath;
            usePath = usePath.replace('./', '');
            var file = FileSystem.getFileForPath(usePath);
            file.exists(Utils.bindFnc(this, function (err, exists) {
                var n = null;
                if (!err) {
                    if (exists) {
                        file.unlink();
                        n = FileSystem.getFileForPath(this.basePath + this.outputFilePath);
                    } else {
                        n = file;
                    }
                    var promise = FileUtils.writeText(n, output);
                    promise.done(function () {
                        Utils.log('ConningCat combine successful');
                    }).fail(function (err) {
                        Utils.log('ConningCat combine failed: ' + err);
                    });
                } else {
                    Utils.log(err);
                }
            }));
            this.activeAsyncCombine = null;
        },
        hasFile: function (filePath) {
            if (this.isValid()) {
                return this.filePaths.indexOf(filePath) !== -1;
            }
            return false;
        },
        isValid: function () {
            if (this.files && this.outputFilePath) {
                return true;
            }
            return false;
        }
    };
    
    module.exports = ConcatSection;
});