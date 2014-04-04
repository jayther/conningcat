/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {
    'use strict';
    
    var AppInit = brackets.getModule('utils/AppInit'),
        ConningCat = require('ConningCat'),
        Menus = brackets.getModule('command/Menus'),
        CommandManager = brackets.getModule('command/CommandManager');
    
    var conningCat = null;
    
    var menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
    var cmdEnabledId = 'conningcat.enabled';
    
    CommandManager.register('ConningCat enabled', cmdEnabledId, function () {
        this.setChecked(!this.getChecked());
        if (conningCat) {
            conningCat.enabled = this.getChecked();
            conningCat.updatePrefsEnabled();
            //conningCat.refresh(); //setting prefs triggers the change event.
        }
    });
    
    var enabledMenuItem = CommandManager.get(cmdEnabledId);
    
    menu.addMenuItem(cmdEnabledId);
    menu.addMenuDivider(Menus.BEFORE, cmdEnabledId);
    
    AppInit.appReady(function () {
        conningCat = new ConningCat({
            debugOutput: true
        });
        $(conningCat).on(ConningCat.events.enabledChanged, function () {
            enabledMenuItem.setChecked(conningCat.enabled);
        });
        $(conningCat).on(ConningCat.events.projectOpened, function () {
            enabledMenuItem.setChecked(conningCat.enabled);
        });
        enabledMenuItem.setChecked(conningCat.enabled);
    });
});