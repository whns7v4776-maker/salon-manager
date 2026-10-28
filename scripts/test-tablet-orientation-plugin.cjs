const assert=require('node:assert/strict'),fs=require('node:fs'),plugin=require('../plugins/with-tablet-orientation');
const activityPath='android/app/src/main/java/com/marzix91/salonmanager/dev/MainActivity.kt';
const original='package isolated.test\nclass MainActivity : ReactActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(null)\n  }\n}';
const result=plugin.configureMainActivity(original);
assert.equal(plugin.configureMainActivity(result),result,'config plugin is idempotent');
if(fs.existsSync(activityPath)){const local=fs.readFileSync(activityPath,'utf8');assert.equal(plugin.configureMainActivity(local),local,'local activity already has the policy');}
assert.match(result,/maximumWindowMetrics/);assert.match(result,/smallestScreenWidthDp/);
assert.match(result,/tabletWidthDp >= 600f/);assert.match(result,/SCREEN_ORIENTATION_UNSPECIFIED/);assert.match(result,/SCREEN_ORIENTATION_PORTRAIT/);
assert.throws(()=>plugin.configureMainActivity('new unsupported activity'),/review/);
const manifest={manifest:{application:[{activity:[{$:{'android:name':'.MainActivity','android:configChanges':'keyboard|orientation|uiMode'}}]}]}};
plugin.configureManifest(manifest);const first=JSON.stringify(manifest);plugin.configureManifest(manifest);assert.equal(JSON.stringify(manifest),first);
const props=manifest.manifest.application[0].activity[0].$;
assert.equal(props['android:screenOrientation'],'unspecified');assert.equal(props['android:resizeableActivity'],'true');
for(const value of ['keyboard','uiMode','orientation','screenSize','screenLayout','smallestScreenSize'])assert.ok(props['android:configChanges'].split('|').includes(value));
assert.throws(()=>plugin.configureManifest({manifest:{}}),/MainActivity not found/);
const info={UISupportedInterfaceOrientations:['UIInterfaceOrientationPortrait'],other:'preserve'};
const ipad=plugin.configureInfoPlist(info);assert.equal(ipad.other,'preserve');assert.deepEqual(ipad.UISupportedInterfaceOrientations,['UIInterfaceOrientationPortrait']);assert.equal(ipad['UISupportedInterfaceOrientations~ipad'].length,4);assert.equal(ipad.UIRequiresFullScreen,false);
const config=require('../app.config')();assert.equal(config.orientation,'portrait');assert.ok(config.plugins.includes('./plugins/with-tablet-orientation'));
const generatedPath='work/native-navigation-20261024/orientation-config.json';if(fs.existsSync(generatedPath)){const generated=JSON.parse(fs.readFileSync(generatedPath,'utf8'));assert.equal(generated.ios.phone.length,2);assert.equal(generated.ios.ipad.length,4);assert.equal(generated.android.activity['android:screenOrientation'],'unspecified');}
console.log('PASS tablet orientation plugin: iPad all orientations, phone portrait preserved, Android tablet/phone policy, split-view classification, handled config changes, idempotence and generated native config. Not a binary/device test.');
