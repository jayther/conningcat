/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */

define(function (require, exports, module) {
    'use strict';
    
    var AppInit = brackets.getModule('utils/AppInit'),
        ConningCat = require('ConningCat');
    var conningCat = null;
    var test = 'meow';
    
    AppInit.appReady(function () {
        conningCat = new ConningCat.ConningCat({
            debugOutput: false
        });
    });
});