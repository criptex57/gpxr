cordova.define("maurodx-cordova-plugin-file-selector.FileChooser", function(require, exports, module) {
module.exports = {
    open: function (success, failure) {
        cordova.exec(success, failure, "FileChooser", "open", []);
    }
};

});
