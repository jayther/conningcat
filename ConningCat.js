/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {
    'use strict';
    
    var FileSystem = brackets.getModule('filesystem/FileSystem'),
        FileUtils = brackets.getModule('file/FileUtils'),
        ProjectManager = brackets.getModule('project/ProjectManager'),
        Async = brackets.getModule('utils/Async'),
        Utils = require('Utils'),
        ConcatSection = require('ConcatSection');
    
    function ConningCat(options) {
        var opts = options || {};
        
        this.configFilePath = opts.configFilePath || ConningCat.DEFAULT_CONFIG_FILEPATH;
        this.config = { concatList: [] };
        this.concatSections = [];
        this.debugOutput = opts.debugOutput || false;
        Utils.setDebugOutput(this.debugOutput);
        
        this.promiseQueue = new Async.PromiseQueue();
        
        this.bindedLoadConfigCallback = Utils.bindFnc(this, this.loadConfigCallback);
        
        this.init();
    }
    ConningCat.DEFAULT_CONFIG_FILEPATH = './conningcat.json';
    ConningCat.prototype = {
        init: function () {
            FileSystem.on('change', Utils.bindFnc(this, this.fileSystemChanged));
            $(ProjectManager).on('projectOpen', Utils.bindFnc(this, this.projectOpened));
            $(ProjectManager).on('projectRefresh', Utils.bindFnc(this, this.projectOpened));
            this.loadConfig();
            Utils.log('ConningCat initted');
        },
        projectOpened: function (e) {
            this.loadConfig();
        },
        loadConfig: function (file) {
            var projectRoot = ProjectManager.getProjectRoot();
            if (projectRoot) {
                if (file) {
                    this.loadConfigCallback(file);
                } else {
                    var self = this;
                    this.promiseQueue.add(function () {
                        var filePath = projectRoot.fullPath + self.configFilePath;
                        var promise = Utils.fileEntryFromPath(filePath);
                        promise.done(self.bindedLoadConfigCallback);
                        return promise;
                    });
                }
            }
        },
        loadConfigCallback: function (entry) {
            var configFile = entry;
            if (configFile && configFile.isFile) {
                var self = this;
                this.promiseQueue.add(function () {
                    var promise = FileUtils.readAsText(configFile);
                    promise.done(
                        Utils.bindFnc(self, self.configLoaded)
                    ).fail(
                        Utils.bindFnc(self, self.configErrored)
                    );
                    return promise;
                });
            } else {
                Utils.log('ConningCat: missing config file (' + this.configFilePath + '). Clearing config.');
                this.clearConfig();
            }
        },
        configLoaded: function (text) {
            var nConfig;
            try {
                nConfig = JSON.parse(text);
            } catch (e) {
                Utils.log('ConningCat: error JSON parse on "' + this.configFilePath + '". Clearing config.');
                this.clearConfig();
            }
            if (nConfig && nConfig.concatList) {
                this.clearConfig();
                this.config = nConfig;
                var concatList = this.config.concatList;
                var projectRoot = ProjectManager.getProjectRoot();
                var rootFullPath = projectRoot.fullPath;
                var strict = this.config.strict || false;
                concatList.forEach(function (rawConcatSection, i) {
                    rawConcatSection.basePath = rootFullPath;
                    if (!rawConcatSection.hasOwnProperty('strict')) {
                        rawConcatSection.strict = strict;
                    }
                    var concatSection = new ConcatSection(rawConcatSection);
                    this.concatSections.push(concatSection);
                    //concatSection.combine();
                    Utils.log('ConningCat: concat section added.');
                }, this);
                Utils.log('ConningCat: Config file loaded.');
            } else {
                Utils.log('ConningCat: missing "concatList" property. Clearing config.');
                this.clearConfig();
            }
        },
        configErrored: function (errorCode) {
            Utils.log('ConningCat: error read on "' + this.configFilePath + '". Clearing config.');
            this.clearConfig();
        },
        clearConfig: function () {
            this.config = { concatList: [] };
            this.concatSections = [];
        },
        combineAllSections: function () {
            //we just want to queue this up in the right order.
            //we're not listening to the end of all of the concatSection combines.
            var self = this;
            this.promiseQueue.add(function () {
                var result = new $.Deferred();
                self.concatSections.forEach(function (concatSection, i) {
                    concatSection.combine();
                }, self);
                result.resolve();
                return result.promise();
            });
        },
        checkEntryWithConcatSections: function (entry) {
            this.concatSections.forEach(function (concatSection, index) {
                if (concatSection.hasFile(entry.fullPath)) {
                    concatSection.combine();
                }
            });
        },
        fileSystemChanged: function (e, entry, added, removed) {
            var i, projectRoot = ProjectManager.getProjectRoot();
            //Utils.log(entry, projectRoot.fullPath + FileUtils.getBaseName(this.configFilePath));
            if (entry) {
                if (projectRoot && ProjectManager.isWithinProject(entry)) {
                    if (entry.isFile) {
                        if (entry.fullPath === projectRoot.fullPath + FileUtils.getBaseName(this.configFilePath)) {
                            this.loadConfig(entry);
                            this.combineAllSections();
                        } else {
                            this.checkEntryWithConcatSections(entry);
                        }
                    }
                }
            }
            if (added) {
                added.forEach(function (entry, i) {
                    this.checkEntryWithConcatSections(entry);
                }, this);
            }
            if (removed) {
                removed.forEach(function (entry, i) {
                    this.checkEntryWithConcatSections(entry);
                }, this);
            }
            if (!entry) {
                this.loadConfig();
            }
        }
    };
    
    exports.ConningCat = ConningCat;
});