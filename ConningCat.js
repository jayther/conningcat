/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {
    'use strict';
    
    var FileSystem = brackets.getModule('filesystem/FileSystem'),
        FileUtils = brackets.getModule('file/FileUtils'),
        ProjectManager = brackets.getModule('project/ProjectManager'),
        PreferencesManager = brackets.getModule('preferences/PreferencesManager'),
        prefs = PreferencesManager.getExtensionPrefs('conningcat'),
        CCPromiseQueue = require('CCPromiseQueue'),
        Utils = require('Utils'),
        ConcatSection = require('ConcatSection');
    
    //TODO: Add events for config read complete, config change, combine finishes.
    //TODO: make UI for adding combine sections and stuff.
    
    function ConningCat(options) {
        var opts = options || {};
        
        this.enabled = false;
        
        prefs.definePreference(
            ConningCat.CONFIG_FILEPATH_PREF_NAME,
            'string',
            ConningCat.CONFIG_FILEPATH_PREF_VALUE_UNSET,
            {
                name: 'ConningCat Config Filepath',
                description: 'The path to the ConningCat config file.'
            }
        ).on('change', Utils.bindFnc(this, this.loadConfigFileFromPrefs));
        
        prefs.definePreference(
            ConningCat.ENABLED_PREF_NAME,
            'boolean',
            false,
            {
                name: 'ConningCat Enabled',
                description: 'Is ConningCat enabled for this project?'
            }
        ).on('change', Utils.bindFnc(this, this.prefsEnabledChanged));
        
        this.configFilePath = opts.configFilePath || null;
        this.rawConfig = null;
        this.config = { concatList: [] };
        this.concatSections = [];
        this.debugOutput = opts.debugOutput || false;
        Utils.setDebugOutput(this.debugOutput);
        
        this.promiseQueue = new CCPromiseQueue();
        
        this.bindedLoadConfigCallback = Utils.bindFnc(this, this.loadConfigCallback);
        this.bindedErrorConfigCallback = Utils.bindFnc(this, this.errorConfigCallback);
        
        this.init();
    }
    ConningCat.CONFIG_FILEPATH_PREF_NAME = 'configFilePath';
    ConningCat.CONFIG_FILEPATH_PREF_VALUE_UNSET = 'conningCatUndefined';
    ConningCat.ENABLED_PREF_NAME = 'enabled';
    ConningCat.DEFAULT_CONFIG_FILEPATH = './conningcat.json';
    ConningCat.events = {
        initted: 'conningcat.initted',
        enabledChanged: 'conningcat.enableChanged',
        projectOpened: 'conningcat.projectopened'
    };
    ConningCat.areConfigsSame = function (a, b) {
        //TODO: this doesn't work, since part of parsing a config involves adding properties (particularly, the concatSections parsing).
        if (a && b && typeof a === 'object' && typeof b === 'object') {
            var aJson = JSON.stringify(a),
                bJson = JSON.stringify(b);
            //console.log(aJson, bJson);
            return aJson === bJson;
        }
        return false;
    };
    ConningCat.prototype = {
        init: function () {
            FileSystem.on('change', Utils.bindFnc(this, this.fileSystemChanged));
            $(ProjectManager).on('projectOpen', Utils.bindFnc(this, this.projectOpened));
            $(ProjectManager).on('projectRefresh', Utils.bindFnc(this, this.projectOpened));
            //this.refresh();
            Utils.log('ConningCat initted');
            $(this).trigger(ConningCat.events.initted);
        },
        projectOpened: function (e) {
            this.configFilePath = null;
            //this.refresh();
            //console.log('meow?');
            Utils.log('ConningCat: project opened.');
            $(this).trigger(ConningCat.events.projectOpened);
        },
        prefsEnabledChanged: function () {
            this.refresh();
            Utils.log('ConningCat: Enabled pref changed.');
            //console.log('rawr?');
        },
        updatePrefsEnabled: function () {
            prefs.set(ConningCat.ENABLED_PREF_NAME, this.enabled, {
                location: {
                    scope: 'project'
                }
            });
            this.promiseQueue.add(function () {
                var promise = prefs.save();
                return promise;
            });
        },
        updatePrefsConfigFilePath: function (configFilePath) {
            if (!configFilePath) {
                configFilePath = this.configFilePath;
            }
            prefs.set(ConningCat.CONFIG_FILEPATH_PREF_NAME, configFilePath, {
                location: {
                    scope: 'project'
                }
            });
            this.promiseQueue.add(function () {
                var promise = prefs.save();
                return promise;
            });
        },
        refresh: function () {
            var prefsEnabled = prefs.get(ConningCat.ENABLED_PREF_NAME);
            if (prefsEnabled !== this.enabled) {
                this.enabled = prefsEnabled;
                $(this).trigger(ConningCat.events.enabledChanged, this.enabled);
            }
            this.refreshConfig();
        },
        refreshConfig: function () {
            if (this.enabled) {
                this.loadConfigFileFromPrefs();
            } else {
                this.clearConfig();
            }
        },
        loadConfigFileFromPrefs: function () {
            if (this.enabled) {
                var configFilePath = prefs.get(ConningCat.CONFIG_FILEPATH_PREF_NAME);
                var saveToPrefs = false;
                Utils.log('ConningCat: loading configFilePath from preferences...');
                if (!configFilePath || configFilePath === ConningCat.CONFIG_FILEPATH_PREF_VALUE_UNSET) {
                    configFilePath = ConningCat.DEFAULT_CONFIG_FILEPATH;
                    saveToPrefs = true;
                }
                if (!this.configFilePath || this.configFilePath !== configFilePath) {
                    this.configFilePath = configFilePath;
                    this.loadConfig();
                }
                if (saveToPrefs) {
                    this.updatePrefsConfigFilePath(configFilePath);
                }
            } else {
                this.clearConfig();
            }
        },
        loadConfig: function (file) {
            if (this.enabled) {
                var projectRoot = ProjectManager.getProjectRoot();
                if (projectRoot) {
                    if (file) {
                        this.loadConfigCallback(file);
                    } else {
                        Utils.log('ConningCat: loading config file...');
                        var self = this;
                        this.promiseQueue.add(function () {
                            var filePath = projectRoot.fullPath + self.configFilePath;
                            var promise = Utils.fileEntryFromPath(filePath);
                            promise.done(self.bindedLoadConfigCallback);
                            promise.fail(self.bindedErrorConfigCallback);
                            return promise;
                        });
                    }
                }
            } else {
                this.clearConfig();
            }
        },
        loadConfigCallback: function (entry) {
            var configFile = entry;
            if (configFile && configFile.isFile) {
                Utils.log('ConningCat: config file loaded. reading...');
                var self = this;
                this.promiseQueue.add(function () {
                    var promise = FileUtils.readAsText(configFile);
                    promise.done(
                        Utils.bindFnc(self, self.configReadCallback)
                    ).fail(
                        Utils.bindFnc(self, self.configReadError)
                    );
                    return promise;
                });
            } else {
                Utils.log('ConningCat: missing config file (' + this.configFilePath + '). Clearing config.');
            }
        },
        errorConfigCallback: function (err) {
            Utils.log('ConningCat: missing config file (' + err + ' on "' + this.configFilePath + '"). Clearing config.');
            this.clearConfig();
        },
        configReadCallback: function (text) {
            var nConfig;
            try {
                nConfig = JSON.parse(text);
            } catch (e) {
                Utils.log('ConningCat: error JSON parse on "' + this.configFilePath + '". Clearing config.');
                this.clearConfig();
            }
            if (nConfig) {
                if (nConfig.concatList) {
                    if (!this.isConfigSame(nConfig)) {
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
                        Utils.log('ConningCat: Config loaded.');
                    } else {
                        Utils.log('ConningCat: No change in config file content.');
                    }
                } else {
                    Utils.log('ConningCat: missing "concatList" property. Clearing config.');
                    this.clearConfig();
                }
            } else {
                Utils.log('ConningCat: unknown read error on config read. Clearing config.');
                this.clearConfig();
            }
        },
        configReadError: function (errorCode) {
            Utils.log('ConningCat: reading error on "' + this.configFilePath + '". Clearing config.');
            this.clearConfig();
        },
        clearConfig: function () {
            this.configFilePath = null;
            this.config = { concatList: [] };
            this.concatSections = [];
        },
        isConfigSame: function (config) {
            return ConningCat.areConfigsSame(this.config, config);
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
            if (this.enabled) {
                var i, projectRoot = ProjectManager.getProjectRoot();
                if (entry) {
                    if (projectRoot && ProjectManager.isWithinProject(entry)) {
                        if (entry.isFile) {
                            var configFilePath = this.configFilePath;
                            if (!this.configFilePath) {
                                configFilePath = prefs.get(ConningCat.CONFIG_FILEPATH_PREF_NAME);
                            }
                            if (configFilePath) {
                                var filePath = configFilePath;
                                filePath = filePath.replace('./', '');
                                if (entry.fullPath === projectRoot.fullPath + filePath) {
                                    this.loadConfig(entry);
                                    this.combineAllSections();
                                } else {
                                    this.checkEntryWithConcatSections(entry);
                                }
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
        }
    };
    
    module.exports = ConningCat;
});