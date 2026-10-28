const {withInfoPlist,withAndroidManifest,withMainActivity}=require('expo/config-plugins');

const marker='// SalonPro tablet rotation';
const ipadOrientations=['UIInterfaceOrientationPortrait','UIInterfaceOrientationPortraitUpsideDown','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'];
function configureInfoPlist(info){return {...info,'UISupportedInterfaceOrientations~ipad':ipadOrientations,UIRequiresFullScreen:false};}
function configureManifest(manifest){
  const activity=manifest.manifest.application?.[0]?.activity?.find(item=>item.$['android:name']==='.MainActivity');
  if(!activity)throw Error('SalonPro tablet rotation: MainActivity not found.');
  activity.$['android:screenOrientation']='unspecified';
  activity.$['android:resizeableActivity']='true';
  const changes=new Set((activity.$['android:configChanges']||'').split('|').filter(Boolean));
  ['orientation','screenSize','screenLayout','smallestScreenSize'].forEach(value=>changes.add(value));
  activity.$['android:configChanges']=[...changes].join('|');
  return manifest;
}
function configureMainActivity(contents){
  if(contents.includes(marker))return contents;
  const startup=/super\.onCreate\((?:null|savedInstanceState)\)/;
  if(!startup.test(contents))throw Error('SalonPro tablet rotation: review the changed Kotlin activity before building.');
  // Maximum bounds identify the device even if the app starts in split view.
  // Actual RN window bounds, not these metrics, decide the visible navigation.
  return contents.replace(startup,match=>`${match}
    ${marker}
    val tabletWidthDp = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
      val bounds = windowManager.maximumWindowMetrics.bounds
      minOf(bounds.width(), bounds.height()) / resources.displayMetrics.density
    } else {
      resources.configuration.smallestScreenWidthDp.toFloat()
    }
    requestedOrientation = if (tabletWidthDp >= 600f) {
      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    } else {
      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }`);
}
function withTabletOrientation(config){
  config=withInfoPlist(config,mod=>{mod.modResults=configureInfoPlist(mod.modResults);return mod;});
  config=withAndroidManifest(config,mod=>{mod.modResults=configureManifest(mod.modResults);return mod;});
  return withMainActivity(config,mod=>{
    if(mod.modResults.language!=='kt')throw Error('SalonPro tablet rotation requires the Kotlin activity.');
    mod.modResults.contents=configureMainActivity(mod.modResults.contents);return mod;
  });
}
module.exports=withTabletOrientation;
module.exports.configureInfoPlist=configureInfoPlist;
module.exports.configureManifest=configureManifest;
module.exports.configureMainActivity=configureMainActivity;
