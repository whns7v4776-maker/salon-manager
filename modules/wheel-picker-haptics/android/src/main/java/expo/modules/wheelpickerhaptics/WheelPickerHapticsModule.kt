package expo.modules.wheelpickerhaptics

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.SystemClock
import android.view.GestureDetector
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.LinearSnapHelper
import androidx.recyclerview.widget.RecyclerView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.viewevent.ViewEventCallback
import expo.modules.kotlin.views.ExpoView
import org.json.JSONArray
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val ITEM_WIDTH_DP = 66f
private const val CARD_WIDTH_DP = 60f
private const val CARD_HEIGHT_DP = 122f
private const val PICKER_HEIGHT_DP = 136f

private data class AgendaDay(
  val value: String,
  val weekdayShort: String,
  val dayNumber: String,
  val monthShort: String,
  val statusLabel: String?,
  val footerLabel: String,
  val selectedLabel: String,
  val isClosed: Boolean,
  val isPast: Boolean,
  val isFull: Boolean,
  val pendingCount: Int
)

private fun Context.dp(value: Float): Int =
  (value * resources.displayMetrics.density).roundToInt()

private fun roundedBackground(
  color: Int,
  strokeColor: Int,
  strokeWidth: Int,
  radius: Float
) = GradientDrawable().apply {
  shape = GradientDrawable.RECTANGLE
  cornerRadius = radius
  setColor(color)
  setStroke(strokeWidth, strokeColor)
}

private fun gradientBackground(
  topColor: Int,
  bottomColor: Int,
  strokeColor: Int,
  strokeWidth: Int,
  radius: Float
) = GradientDrawable(
  GradientDrawable.Orientation.TOP_BOTTOM,
  intArrayOf(topColor, bottomColor)
).apply {
  shape = GradientDrawable.RECTANGLE
  cornerRadius = radius
  setStroke(strokeWidth, strokeColor)
}

@SuppressLint("ViewConstructor")
private class AgendaDayCell(context: Context) : FrameLayout(context) {
  private val card = FrameLayout(context)
  private val sheen = View(context)
  private val weekday = text(10.5f, Typeface.BOLD)
  private val dayNumber = text(25f, Typeface.BOLD)
  private val statusShell = FrameLayout(context)
  private val status = text(6.7f, Typeface.BOLD)
  private val month = text(10f, Typeface.BOLD)
  private val footerShell = FrameLayout(context)
  private val footer = text(6.4f, Typeface.BOLD)
  private val pending = text(9.5f, Typeface.BOLD)
  private var selectedState = false

  init {
    clipChildren = false
    clipToPadding = false
    card.clipChildren = false
    addView(card)
    card.addView(sheen)
    card.addView(weekday)
    card.addView(dayNumber)
    statusShell.addView(status)
    card.addView(statusShell)
    card.addView(month)
    footerShell.addView(footer)
    card.addView(footerShell)
    card.addView(pending)

    pending.setTextColor(Color.WHITE)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
  }

  private fun text(sizeSp: Float, style: Int) = TextView(context).apply {
    gravity = Gravity.CENTER
    textSize = sizeSp
    typeface = Typeface.create("sans-serif", style)
    includeFontPadding = false
    maxLines = 1
    letterSpacing = if (sizeSp < 11f) 0.035f else 0f
  }

  private fun exact(value: Float) =
    MeasureSpec.makeMeasureSpec(context.dp(value), MeasureSpec.EXACTLY)

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val measuredHeight = MeasureSpec.getSize(heightMeasureSpec)
      .takeIf { it > 0 }
      ?: context.dp(PICKER_HEIGHT_DP)
    setMeasuredDimension(context.dp(ITEM_WIDTH_DP), measuredHeight)
    card.measure(exact(CARD_WIDTH_DP), exact(CARD_HEIGHT_DP))
    sheen.measure(exact(48f), exact(32f))
    weekday.measure(exact(50f), exact(15f))
    dayNumber.measure(exact(54f), exact(31f))
    statusShell.measure(exact(50f), exact(16f))
    status.measure(exact(48f), exact(15f))
    month.measure(exact(50f), exact(14f))
    footerShell.measure(exact(46f), exact(18f))
    footer.measure(exact(44f), exact(17f))
    pending.measure(exact(29f), exact(25f))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val cardWidth = context.dp(CARD_WIDTH_DP)
    val cardHeight = context.dp(CARD_HEIGHT_DP)
    val cardLeft = (width - cardWidth) / 2
    val cardTop = context.dp(7f)
    card.layout(cardLeft, cardTop, cardLeft + cardWidth, cardTop + cardHeight)
    sheen.layout(context.dp(6f), 0, context.dp(54f), context.dp(32f))
    weekday.layout(context.dp(5f), context.dp(7f), context.dp(55f), context.dp(22f))
    dayNumber.layout(context.dp(3f), context.dp(23f), context.dp(57f), context.dp(54f))
    statusShell.layout(context.dp(5f), context.dp(56f), context.dp(55f), context.dp(72f))
    status.layout(context.dp(1f), 0, context.dp(49f), context.dp(15f))
    month.layout(context.dp(5f), context.dp(77f), context.dp(55f), context.dp(91f))
    footerShell.layout(context.dp(7f), context.dp(98f), context.dp(53f), context.dp(116f))
    footer.layout(context.dp(1f), 0, context.dp(45f), context.dp(17f))
    pending.layout(context.dp(31f), -context.dp(4f), context.dp(60f), context.dp(21f))
  }

  fun bind(day: AgendaDay, selected: Boolean) {
    selectedState = selected
    weekday.text = day.weekdayShort.uppercase()
    dayNumber.text = day.dayNumber
    month.text = day.monthShort.uppercase()
    status.text = day.statusLabel?.uppercase().orEmpty()
    statusShell.visibility = if (day.statusLabel.isNullOrBlank()) INVISIBLE else VISIBLE
    footer.text = (if (selected) day.selectedLabel else day.footerLabel).uppercase()
    pending.visibility = if (day.pendingCount > 0) VISIBLE else GONE
    pending.text = if (day.pendingCount > 9) "9+" else "+${day.pendingCount}"

    val textColor = when {
      day.isFull -> Color.rgb(100, 116, 139)
      selected -> Color.rgb(248, 250, 255)
      else -> Color.rgb(10, 18, 33)
    }
    weekday.setTextColor(textColor)
    dayNumber.setTextColor(textColor)
    month.setTextColor(textColor)

    val cardColor = when {
      day.isFull -> Color.rgb(235, 239, 244)
      selected -> Color.rgb(21, 34, 56)
      day.isClosed -> Color.rgb(251, 224, 228)
      else -> Color.rgb(210, 243, 224)
    }
    val borderColor = when {
      day.isFull -> Color.rgb(203, 213, 225)
      selected -> Color.rgb(105, 133, 184)
      day.isClosed -> Color.rgb(233, 159, 170)
      else -> Color.rgb(143, 215, 173)
    }
    val footerColor = when {
      day.isFull -> Color.rgb(220, 227, 235)
      selected -> Color.rgb(47, 103, 224)
      day.isClosed -> Color.rgb(246, 213, 218)
      else -> Color.rgb(189, 229, 205)
    }
    val footerTextColor = when {
      day.isFull -> Color.rgb(100, 116, 139)
      selected -> Color.rgb(238, 244, 255)
      day.isClosed -> Color.rgb(199, 77, 87)
      else -> Color.rgb(28, 143, 87)
    }

    card.background = roundedBackground(
      cardColor,
      borderColor,
      context.dp(if (selected) 1.5f else 1f),
      context.dp(22f).toFloat()
    )
    // Su Samsung l'elevation di una card traslucida dentro RecyclerView puo
    // lasciare un layer rettangolare. Il contrasto, il bordo e la lente fissa
    // distinguono gia nettamente il giorno centrale senza layer hardware.
    card.elevation = 0f
    card.translationZ = 0f
    card.scaleX = 1f
    card.scaleY = 1f
    sheen.background = gradientBackground(
      if (selected) Color.argb(48, 255, 255, 255) else Color.argb(105, 255, 255, 255),
      Color.TRANSPARENT,
      Color.TRANSPARENT,
      0,
      context.dp(16f).toFloat()
    )
    footerShell.background = roundedBackground(
      footerColor,
      if (selected) Color.rgb(177, 202, 255) else Color.argb(30, 26, 135, 84),
      context.dp(1f),
      context.dp(9f).toFloat()
    )
    footer.setTextColor(footerTextColor)
    statusShell.background = roundedBackground(
      if (day.isFull) Color.rgb(220, 227, 235) else Color.rgb(249, 218, 224),
      if (day.isFull) Color.rgb(203, 213, 225) else Color.rgb(223, 135, 148),
      context.dp(1f),
      context.dp(8f).toFloat()
    )
    status.setTextColor(if (day.isFull) Color.rgb(100, 116, 139) else Color.rgb(199, 77, 87))
    pending.background = gradientBackground(
      Color.rgb(246, 70, 85),
      Color.rgb(205, 31, 52),
      Color.WHITE,
      context.dp(2f),
      context.dp(13f).toFloat()
    )
    contentDescription = listOf(day.weekdayShort, day.dayNumber, day.monthShort, footer.text)
      .joinToString(", ")
  }

  override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo?) {
    super.onInitializeAccessibilityNodeInfo(info)
    info?.className = "android.widget.Button"
    info?.isClickable = true
    info?.isSelected = selectedState
  }
}

/**
 * Motore unico del picker Agenda Android: la lista nativa possiede tap e pan,
 * lo snap decide un solo giorno centrale e React riceve solo l'esito finale.
 */
@SuppressLint("ViewConstructor")
class AgendaDayPickerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onSelectionChange by EventDispatcher<Map<String, Any>>()
  private val onSelectionDeep by EventDispatcher<Map<String, Any>>()
  private val onDayLongPress by EventDispatcher<Map<String, Any>>()
  private val onInteractionStart by EventDispatcher<Unit>()
  private val onInteractionEnd by EventDispatcher<Unit>()

  private val layoutManager = LinearLayoutManager(context, RecyclerView.HORIZONTAL, false)
  private val snapHelper = LinearSnapHelper()
  private val adapter = DayAdapter()
  private val recyclerView = PickerRecyclerView(context)
  private val centerLens = View(context)
  private val centerMarker = View(context)
  private val skeletonLayer = FrameLayout(context)
  private val skeletonRow = LinearLayout(context)
  private val settleInterpolator = DecelerateInterpolator(1.7f)
  private var skeletonPulse: ObjectAnimator? = null

  private var days: List<AgendaDay> = emptyList()
  private var lastDaysJson = ""
  private var selectedIndex = 0
  private var previewIndex = 0
  private var selectionVisible = true
  private var hapticIndex = 0
  private var pendingSelectedIndex: Int? = null
  private var userAuthorityIndex: Int? = null
  private var userAuthorityUntil = 0L
  private var interactionActive = false
  private var didDrag = false
  private var finishingSnap = false
  private var tapCommitted = false
  private var pickerRevealed = false
  private var centerRequestPending = false

  private val gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
    override fun onDown(event: MotionEvent): Boolean = true

    override fun onSingleTapUp(event: MotionEvent): Boolean {
      if (didDrag) return false
      val index = adapterIndexAt(event.x, event.y) ?: return false
      selectTappedDay(index, deep = false)
      return true
    }

    override fun onDoubleTap(event: MotionEvent): Boolean {
      if (didDrag) return false
      val index = adapterIndexAt(event.x, event.y) ?: return false
      selectTappedDay(index, deep = true)
      return true
    }

    override fun onLongPress(event: MotionEvent) {
      if (didDrag || recyclerView.scrollState != RecyclerView.SCROLL_STATE_IDLE) return
      val index = adapterIndexAt(event.x, event.y) ?: return
      recyclerView.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
      emit(onDayLongPress, index)
    }
  })

  init {
    clipChildren = false
    clipToPadding = false

    centerLens.isClickable = false
    centerLens.isFocusable = false
    centerLens.isEnabled = false
    centerLens.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    centerLens.background = gradientBackground(
      Color.TRANSPARENT,
      Color.TRANSPARENT,
      Color.argb(178, 96, 165, 250),
      context.dp(1f),
      context.dp(25f).toFloat()
    )
    // Nessuna elevation: su alcuni Samsung l'ombra della View traslucida
    // viene rasterizzata come un rettangolo bianco. Il vetro resta definito
    // solo dalla sfumatura e dal bordo nativi, entrambi arrotondati.
    centerLens.elevation = 0f
    centerLens.translationZ = 0f
    centerLens.visibility = INVISIBLE

    recyclerView.layoutManager = layoutManager
    recyclerView.adapter = adapter
    recyclerView.itemAnimator = null
    recyclerView.overScrollMode = View.OVER_SCROLL_NEVER
    recyclerView.isHorizontalScrollBarEnabled = false
    recyclerView.isVerticalScrollBarEnabled = false
    recyclerView.isNestedScrollingEnabled = false
    recyclerView.clipToPadding = false
    recyclerView.setHasFixedSize(true)
    recyclerView.setItemViewCacheSize(14)
    recyclerView.alpha = 0f
    recyclerView.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          recyclerView.stopScroll()
          didDrag = false
          finishingSnap = false
          tapCommitted = false
          setSelectionVisible(false)
          beginInteraction()
        }
        MotionEvent.ACTION_CANCEL -> if (!didDrag) {
          setSelectionVisible(true)
          finishInteraction()
        }
      }
      gestureDetector.onTouchEvent(event)
      if (event.actionMasked == MotionEvent.ACTION_UP && !didDrag && !tapCommitted) {
        setSelectionVisible(true)
        finishInteraction()
      }
      false
    }
    recyclerView.addOnScrollListener(object : RecyclerView.OnScrollListener() {
      override fun onScrollStateChanged(view: RecyclerView, newState: Int) {
        when (newState) {
          RecyclerView.SCROLL_STATE_DRAGGING -> {
            beginInteraction()
            didDrag = true
            finishingSnap = false
            tapCommitted = false
            setSelectionVisible(false)
          }
          RecyclerView.SCROLL_STATE_SETTLING -> if (didDrag) finishingSnap = true
          RecyclerView.SCROLL_STATE_IDLE -> {
            if (didDrag || finishingSnap) view.post { finalizeCenteredDay() }
          }
        }
      }

      override fun onScrolled(view: RecyclerView, dx: Int, dy: Int) {
        if (!interactionActive && view.scrollState == RecyclerView.SCROLL_STATE_IDLE) return
        val next = nearestIndex() ?: return
        setPreviewIndex(next)
        if (next != hapticIndex) {
          hapticIndex = next
          view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
        }
      }
    })
    snapHelper.attachToRecyclerView(recyclerView)
    addView(recyclerView)

    // La lente appartiene al viewport, non alle celle: resta immobile mentre
    // i giorni scorrono sotto di lei e non produce piu il salto grafico della
    // vecchia selezione che si spostava da una card all'altra.
    addView(centerLens)

    centerMarker.isClickable = false
    centerMarker.isFocusable = false
    centerMarker.isEnabled = false
    centerMarker.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    centerMarker.background = gradientBackground(
      Color.rgb(96, 165, 250),
      Color.rgb(37, 99, 235),
      Color.WHITE,
      context.dp(1f),
      context.dp(3f).toFloat()
    )
    centerMarker.elevation = context.dp(15f).toFloat()
    centerMarker.visibility = INVISIBLE
    addView(centerMarker)

    skeletonRow.orientation = LinearLayout.HORIZONTAL
    skeletonRow.gravity = Gravity.CENTER
    repeat(5) { index ->
      val isCenter = index == 2
      skeletonRow.addView(View(context).apply {
        background = gradientBackground(
          if (isCenter) Color.rgb(216, 230, 247) else Color.rgb(235, 241, 247),
          if (isCenter) Color.rgb(196, 216, 238) else Color.rgb(220, 230, 240),
          if (isCenter) Color.rgb(171, 199, 231) else Color.rgb(207, 220, 234),
          context.dp(1f),
          context.dp(if (isCenter) 25f else 22f).toFloat()
        )
        elevation = context.dp(if (isCenter) 5f else 2f).toFloat()
        layoutParams = LinearLayout.LayoutParams(
          context.dp(60f),
          context.dp(if (isCenter) 128f else 122f)
        ).apply {
          marginStart = context.dp(3f)
          marginEnd = context.dp(3f)
        }
      })
    }
    skeletonLayer.setBackgroundColor(Color.WHITE)
    skeletonLayer.addView(
      skeletonRow,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
        Gravity.CENTER
      )
    )
    addView(skeletonLayer)
    skeletonPulse = ObjectAnimator.ofFloat(skeletonRow, View.ALPHA, 0.72f, 1f).apply {
      duration = 760L
      repeatMode = ValueAnimator.REVERSE
      repeatCount = ValueAnimator.INFINITE
      start()
    }
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    val sideInset = max(0, (width - context.dp(ITEM_WIDTH_DP)) / 2)
    recyclerView.setPadding(sideInset, 0, sideInset, 0)
    centerSelectedIndexAndDispatchReady()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    recyclerView.layout(0, 0, width, height)
    val lensWidth = context.dp(64f)
    val lensHeight = min(context.dp(126f), max(0, height - context.dp(10f)))
    val lensLeft = (width - lensWidth) / 2
    centerLens.layout(lensLeft, context.dp(5f), lensLeft + lensWidth, context.dp(5f) + lensHeight)
    val markerWidth = context.dp(26f)
    val markerLeft = (width - markerWidth) / 2
    centerMarker.layout(markerLeft, 0, markerLeft + markerWidth, context.dp(4f))
    skeletonLayer.layout(0, 0, width, height)
    if (!pickerRevealed && days.isNotEmpty()) {
      centerSelectedIndexAndDispatchReady()
    }
  }

  fun setDaysJson(json: String) {
    if (json == lastDaysJson) return
    val decoded = runCatching {
      val array = JSONArray(json)
      List(array.length()) { index ->
        val item = array.getJSONObject(index)
        AgendaDay(
          value = item.optString("value"),
          weekdayShort = item.optString("weekdayShort"),
          dayNumber = item.optString("dayNumber"),
          monthShort = item.optString("monthShort"),
          statusLabel = item.optString("statusLabel").takeIf { it.isNotBlank() && it != "null" },
          footerLabel = item.optString("footerLabel"),
          selectedLabel = item.optString("selectedLabel"),
          isClosed = item.optBoolean("isClosed"),
          isPast = item.optBoolean("isPast"),
          isFull = item.optBoolean("isFull"),
          pendingCount = item.optInt("pendingCount")
        )
      }
    }.getOrNull() ?: return

    lastDaysJson = json
    days = decoded
    selectedIndex = bounded(pendingSelectedIndex ?: selectedIndex)
    pendingSelectedIndex = null
    previewIndex = bounded(previewIndex)
    hapticIndex = previewIndex
    adapter.notifyDataSetChanged()
    if (!interactionActive) {
      previewIndex = selectedIndex
      centerSelectedIndexAndDispatchReady()
    }
  }

  fun setSelectedIndex(index: Int) {
    if (days.isEmpty()) {
      pendingSelectedIndex = max(0, index)
      return
    }
    val next = bounded(index)
    val authority = userAuthorityIndex
    if (authority != null && SystemClock.uptimeMillis() < userAuthorityUntil) {
      if (next == authority) userAuthorityIndex = null
      return
    }
    userAuthorityIndex = null
    if (interactionActive || next == selectedIndex) return
    selectedIndex = next
    hapticIndex = next
    setPreviewIndex(next)
    setSelectionVisible(true)
    centerIndex(next)
  }

  private fun selectTappedDay(index: Int, deep: Boolean) {
    if (days.isEmpty()) return
    val target = bounded(index)
    tapCommitted = true
    recyclerView.stopScroll()
    setPreviewIndex(target)
    setSelectionVisible(true)
    recyclerView.performHapticFeedback(
      if (deep) HapticFeedbackConstants.LONG_PRESS else HapticFeedbackConstants.CONFIRM
    )
    commitSelection(target, deep, forceEmit = true)
    centerIndex(target) {
      finishInteraction()
    }
  }

  private fun finalizeCenteredDay() {
    if (days.isEmpty() || recyclerView.scrollState != RecyclerView.SCROLL_STATE_IDLE) return
    val target = nearestIndex() ?: return finishInteraction()
    val targetView = layoutManager.findViewByPosition(target)
    if (targetView != null) {
      val distance = (targetView.left + targetView.right) / 2 - recyclerView.width / 2
      if (abs(distance) > 1) {
        finishingSnap = true
        recyclerView.smoothScrollBy(distance, 0, settleInterpolator, 90)
        return
      }
    }
    didDrag = false
    finishingSnap = false
    setPreviewIndex(target)
    setSelectionVisible(true)
    commitSelection(target, deep = false)
    finishInteraction()
  }

  private fun commitSelection(index: Int, deep: Boolean, forceEmit: Boolean = false) {
    val target = bounded(index)
    val changed = target != selectedIndex
    selectedIndex = target
    hapticIndex = target
    userAuthorityIndex = target
    userAuthorityUntil = SystemClock.uptimeMillis() + 2_500L
    if (deep || changed || forceEmit) {
      emit(if (deep) onSelectionDeep else onSelectionChange, target)
    }
  }

  private fun beginInteraction() {
    if (interactionActive) return
    interactionActive = true
    onInteractionStart(Unit)
  }

  private fun finishInteraction() {
    if (!interactionActive) return
    interactionActive = false
    didDrag = false
    finishingSnap = false
    tapCommitted = false
    onInteractionEnd(Unit)
  }

  private fun setPreviewIndex(index: Int) {
    val target = bounded(index)
    if (previewIndex == target) return
    previewIndex = target
    refreshVisibleCells()
  }

  private fun setSelectionVisible(visible: Boolean) {
    if (selectionVisible == visible) return
    selectionVisible = visible
    refreshVisibleCells()
  }

  private fun refreshVisibleCells() {
    // RecyclerView vieta notifyItemChanged durante layout/scroll. Aggiorniamo
    // direttamente le sole celle visibili: le nuove celle useranno comunque
    // previewIndex in onBindViewHolder.
    for (childIndex in 0 until recyclerView.childCount) {
      val child = recyclerView.getChildAt(childIndex)
      val position = recyclerView.getChildAdapterPosition(child)
      if (position !in days.indices) continue
      (recyclerView.getChildViewHolder(child) as? DayHolder)?.cell?.bind(
        days[position],
        selectionVisible && position == previewIndex
      )
    }
  }

  private fun emit(dispatcher: ViewEventCallback<Map<String, Any>>, index: Int) {
    if (index !in days.indices) return
    dispatcher(mapOf("index" to index, "value" to days[index].value))
  }

  private fun bounded(index: Int): Int =
    if (days.isEmpty()) 0 else min(max(index, 0), days.lastIndex)

  private fun nearestIndex(): Int? {
    if (days.isEmpty()) return null
    val center = recyclerView.width / 2
    var nearestPosition = RecyclerView.NO_POSITION
    var nearestDistance = Int.MAX_VALUE
    for (childIndex in 0 until recyclerView.childCount) {
      val child = recyclerView.getChildAt(childIndex)
      val position = recyclerView.getChildAdapterPosition(child)
      if (position == RecyclerView.NO_POSITION) continue
      val distance = abs((child.left + child.right) / 2 - center)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestPosition = position
      }
    }
    return nearestPosition.takeIf { it != RecyclerView.NO_POSITION }
  }

  private fun adapterIndexAt(x: Float, y: Float): Int? {
    val child = recyclerView.findChildViewUnder(x, y) ?: return nearestIndex()
    return recyclerView.getChildAdapterPosition(child)
      .takeIf { it != RecyclerView.NO_POSITION }
  }

  private fun centerIndex(index: Int, onCentered: (() -> Unit)? = null) {
    if (days.isEmpty() || width <= 0 || centerRequestPending) return
    val target = bounded(index)
    centerRequestPending = true
    recyclerView.post {
      val visibleTarget = layoutManager.findViewByPosition(target)
      if (visibleTarget != null) {
        val directDistance =
          (visibleTarget.left + visibleTarget.right) / 2 - recyclerView.width / 2
        if (directDistance != 0) recyclerView.scrollBy(directDistance, 0)
        recyclerView.post { centerVisibleTarget(target, onCentered) }
        return@post
      }
      // In una view React Native Android le richieste di layout interne del
      // RecyclerView possono essere trattenute dal parent Fabric. Muoviamo la
      // distanza reale in pixel dalla cella attualmente centrale: il riciclo
      // avviene subito e la cella richiesta viene materializzata nello stesso
      // passaggio, senza dipendere da un secondo layout del parent.
      val current = nearestIndex()
      if (current != null && current != target) {
        recyclerView.scrollBy((target - current) * context.dp(ITEM_WIDTH_DP), 0)
      } else if (current == null) {
        layoutManager.scrollToPositionWithOffset(target, 0)
      }
      recyclerView.post { centerVisibleTarget(target, onCentered) }
    }
  }

  private fun centerVisibleTarget(index: Int, onCentered: (() -> Unit)? = null) {
    val targetView = layoutManager.findViewByPosition(index)
    if (targetView == null) {
      centerRequestPending = false
      recyclerView.postDelayed({ centerIndex(index, onCentered) }, 16L)
      return
    }
    val distance = (targetView.left + targetView.right) / 2 - recyclerView.width / 2
    if (distance != 0) recyclerView.scrollBy(distance, 0)
    recyclerView.post {
      val finalView = layoutManager.findViewByPosition(index)
      val residual = finalView?.let {
        (it.left + it.right) / 2 - recyclerView.width / 2
      } ?: 0
      if (residual != 0) recyclerView.scrollBy(residual, 0)
      centerRequestPending = false
      onCentered?.invoke()
    }
  }

  private fun centerSelectedIndexAndDispatchReady() {
    centerIndex(selectedIndex) {
      recyclerView.post reveal@{
        if (pickerRevealed || days.isEmpty() || recyclerView.width <= 0) return@reveal
        // Il picker appare solo quando la cella selezionata e' stata misurata
        // e centrata davvero. Fino a quel momento resta lo skeleton nativo.
        pickerRevealed = true
        recyclerView.alpha = 1f
        centerLens.visibility = VISIBLE
        centerMarker.visibility = VISIBLE
        skeletonPulse?.cancel()
        skeletonPulse = null
        skeletonLayer.animate()
          .alpha(0f)
          .setDuration(140L)
          .withEndAction { skeletonLayer.visibility = GONE }
          .start()
      }
    }
  }

  private inner class DayAdapter : RecyclerView.Adapter<DayHolder>() {
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): DayHolder =
      DayHolder(AgendaDayCell(parent.context).apply {
        layoutParams = RecyclerView.LayoutParams(
          context.dp(ITEM_WIDTH_DP),
          ViewGroup.LayoutParams.MATCH_PARENT
        )
      })

    override fun onBindViewHolder(holder: DayHolder, position: Int) {
      holder.cell.bind(
        days[position],
        selectionVisible && position == previewIndex
      )
    }

    override fun getItemCount(): Int = days.size
  }

  private class DayHolder(val cell: AgendaDayCell) : RecyclerView.ViewHolder(cell)

  private inner class PickerRecyclerView(context: Context) : RecyclerView(context) {
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private var downX = 0f
    private var downY = 0f

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.x
          downY = event.y
          parent?.requestDisallowInterceptTouchEvent(true)
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = abs(event.x - downX)
          val dy = abs(event.y - downY)
          when {
            dx > touchSlop && dx >= dy -> parent?.requestDisallowInterceptTouchEvent(true)
            dy > touchSlop && dy > dx -> parent?.requestDisallowInterceptTouchEvent(false)
          }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL ->
          parent?.requestDisallowInterceptTouchEvent(false)
      }
      return super.dispatchTouchEvent(event)
    }
  }
}

class WheelPickerHapticsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoWheelPickerHaptics")

    Function("supportsNativeAgendaDayPicker") { true }
    Function("prepareSelection") { }
    Function("selectionChanged") { }
    Function("selectionChangedBurst") { _: Int -> }
    Function("endSelection") { }

    View(AgendaDayPickerView::class) {
      Name("AgendaDayPicker")
      Events(
        "onSelectionChange",
        "onSelectionDeep",
        "onDayLongPress",
        "onInteractionStart",
        "onInteractionEnd"
      )
      Prop("daysJson") { view: AgendaDayPickerView, value: String -> view.setDaysJson(value) }
      Prop("selectedIndex") { view: AgendaDayPickerView, value: Int -> view.setSelectedIndex(value) }
    }
  }
}
