const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../node_modules/react-native-pager-view');
if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version !== '6.9.1') {
  throw new Error('Rivedere la patch sensibilità Android per la nuova versione del pager.');
}
function patch(relative, before, after) {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Patch Android non applicabile: ${relative}`);
  fs.writeFileSync(file, source.replace(before, after));
}
const helper = `package com.reactnativepagerview

import android.util.Log
import android.view.ViewConfiguration
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.widget.ViewPager2
import kotlin.math.max

// ViewPager2 exposes no public touch-slop setter. Keep these fields through
// R8 and use device-scaled thresholds; the pager's native drag remains intact.
internal object SalonPagerSensitivity {
    fun configure(pager: ViewPager2) {
        val recycler = pager.getChildAt(0) as? RecyclerView ?: return
        val config = ViewConfiguration.get(pager.context)
        try {
            val slop = RecyclerView::class.java.getDeclaredField("mTouchSlop")
            slop.isAccessible = true
            slop.setInt(recycler, max(slop.getInt(recycler), config.scaledPagingTouchSlop * 2))
            val velocity = RecyclerView::class.java.getDeclaredField("mMinFlingVelocity")
            velocity.isAccessible = true
            velocity.setInt(recycler, max(velocity.getInt(recycler), config.scaledMinimumFlingVelocity * 2))
        } catch (error: ReflectiveOperationException) {
            Log.w("SalonPagerSensitivity", "Native pager thresholds unavailable", error)
        }
    }
}
`;
fs.writeFileSync(path.join(root, 'android/src/main/java/com/reactnativepagerview/SalonPagerSensitivity.kt'), helper);
for (const architecture of ['paper', 'fabric']) {
  patch(`android/src/${architecture}/java/com/reactnativepagerview/PagerViewViewManager.kt`,
    'val vp = ViewPager2(reactContext)',
    'val vp = ViewPager2(reactContext)\n        SalonPagerSensitivity.configure(vp)');
}
fs.writeFileSync(path.join(root, 'android/salon-pager-consumer-rules.pro'), `-keepclassmembers class androidx.recyclerview.widget.RecyclerView {
    int mTouchSlop;
    int mMinFlingVelocity;
}
`);
patch('android/build.gradle', 'defaultConfig {', 'defaultConfig {\n    consumerProguardFiles "salon-pager-consumer-rules.pro"');
console.log('Sensibilità pager Android applicata (Paper e Fabric).');
