const assert=require('node:assert/strict'),plugin=require('../plugins/with-ios-build-compat');
const input="post_install do |installer|\n    react_native_post_install(\n      installer,\n      config[:reactNativePath],\n      :mac_catalyst_enabled => false,\n    )\n  end\n";
const result=plugin.configurePodfile(input);assert.equal(plugin.configurePodfile(result),result);assert.match(result,/minimum_ios = Gem::Version.new\('15.1'\)/);assert.match(result,/Gem::Version.new\(current\) < minimum_ios/);assert.throws(()=>plugin.configurePodfile('unknown hook'),/review/);
const key='com.apple.developer.associated-domains',original={[key]:[],'aps-environment':'development'};
const cleared=plugin.configureEntitlements({ios:{bundleIdentifier:'com.salonpro.dev'}},original);assert.equal(key in cleared,false);assert.equal(cleared['aps-environment'],'development');assert.ok(key in original);
assert.equal(plugin.configureEntitlements({ios:{bundleIdentifier:'com.salonpro'}},original),original);
const configured={[key]:['applinks:example.test']};assert.equal(plugin.configureEntitlements({ios:{bundleIdentifier:'com.salonpro.dev'}},configured),configured);
console.log('PASS iOS build compatibility: idempotent supported pod floor, unknown-template guard, empty dev capability cleanup and production domain preservation.');
