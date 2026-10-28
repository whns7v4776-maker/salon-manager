import ExpoModulesCore
import Foundation
import UIKit

struct AgendaDayPickerDay: Decodable {
  let value: String
  let weekdayShort: String
  let dayNumber: String
  let monthShort: String
  let statusLabel: String?
  let footerLabel: String
  let selectedLabel: String
  let isClosed: Bool
  let isPast: Bool?
  let isFull: Bool?
  let pendingCount: Int
}

private enum AgendaDayPickerMetrics {
  static let itemWidth: CGFloat = 50
  static let cardWidth: CGFloat = 56
  static let cardHeight: CGFloat = 124
  static let topOverflowInset: CGFloat = 8
  static let viewportHeight: CGFloat = 136
  static let glideDecelerationRate = UIScrollView.DecelerationRate(rawValue: 0.9993)
}

private final class AgendaDayPickerFlowLayout: UICollectionViewFlowLayout {
  override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
    newBounds.size != collectionView?.bounds.size
  }
}

private final class AgendaDayPickerCollectionView: UICollectionView {
  var onImmediateTouchBegan: (() -> Void)?

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    onImmediateTouchBegan?()
    super.touchesBegan(touches, with: event)
  }

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    if gestureRecognizer === panGestureRecognizer {
      // Dentro il picker il pan appartiene sempre alla ruota. Non filtriamo
      // velocita' o inclinazione: anche una ripresa lenta durante l'inerzia deve
      // diventare immediatamente controllo manuale continuo.
      return true
    }
    return super.gestureRecognizerShouldBegin(gestureRecognizer)
  }
}

private final class AgendaDayPickerCell: UICollectionViewCell {
  static let reuseIdentifier = "AgendaDayPickerCell"

  private let cardView = UIView()
  private let innerRimView = UIView()
  private let weekdayLabel = UILabel()
  private let dayNumberLabel = UILabel()
  private let statusBadge = UIView()
  private let statusLabel = UILabel()
  private let monthLabel = UILabel()
  private let footerView = UIView()
  private let footerLabel = UILabel()
  private let pendingBadgeShell = UIView()
  private let pendingBadge = UILabel()

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = false
    contentView.clipsToBounds = false

    cardView.clipsToBounds = false
    cardView.layer.cornerRadius = 22
    cardView.layer.cornerCurve = .continuous
    contentView.addSubview(cardView)

    innerRimView.isUserInteractionEnabled = false
    innerRimView.layer.cornerRadius = 18
    innerRimView.layer.cornerCurve = .continuous
    innerRimView.layer.borderWidth = 0.75
    cardView.addSubview(innerRimView)

    [weekdayLabel, dayNumberLabel, monthLabel].forEach {
      $0.textAlignment = .center
      $0.adjustsFontSizeToFitWidth = true
      $0.minimumScaleFactor = 0.75
      cardView.addSubview($0)
    }

    weekdayLabel.font = .systemFont(ofSize: 10.5, weight: .black)
    dayNumberLabel.font = .systemFont(ofSize: 24, weight: .black)
    monthLabel.font = .systemFont(ofSize: 10.5, weight: .black)

    statusBadge.layer.cornerRadius = 7.5
    statusBadge.layer.cornerCurve = .continuous
    statusBadge.layer.borderWidth = 1
    cardView.addSubview(statusBadge)

    statusLabel.font = .systemFont(ofSize: 6.6, weight: .black)
    statusLabel.textAlignment = .center
    statusLabel.adjustsFontSizeToFitWidth = true
    statusLabel.minimumScaleFactor = 0.68
    statusBadge.addSubview(statusLabel)

    footerView.layer.cornerRadius = 8
    footerView.layer.cornerCurve = .continuous
    footerView.layer.borderWidth = 1
    cardView.addSubview(footerView)

    footerLabel.font = .systemFont(ofSize: 6.1, weight: .black)
    footerLabel.textAlignment = .center
    footerLabel.adjustsFontSizeToFitWidth = true
    footerLabel.minimumScaleFactor = 0.68
    footerView.addSubview(footerLabel)

    pendingBadge.font = .systemFont(ofSize: 10, weight: .black)
    pendingBadge.textAlignment = .center
    pendingBadge.textColor = .white
    pendingBadge.alpha = 1
    pendingBadge.backgroundColor = UIColor(red: 0.86, green: 0.15, blue: 0.15, alpha: 1)
    pendingBadge.clipsToBounds = true
    pendingBadge.layer.borderColor = UIColor.white.cgColor
    pendingBadge.layer.borderWidth = 2
    pendingBadge.layer.cornerRadius = 12
    pendingBadge.layer.cornerCurve = .continuous

    pendingBadgeShell.backgroundColor = .clear
    pendingBadgeShell.isUserInteractionEnabled = false
    pendingBadgeShell.alpha = 1
    pendingBadgeShell.layer.shadowColor = UIColor(red: 0.6, green: 0.1, blue: 0.1, alpha: 1).cgColor
    pendingBadgeShell.layer.shadowOpacity = 0.2
    pendingBadgeShell.layer.shadowRadius = 6
    pendingBadgeShell.layer.shadowOffset = CGSize(width: 0, height: 3)
    pendingBadgeShell.layer.zPosition = 100
    pendingBadgeShell.addSubview(pendingBadge)
    cardView.addSubview(pendingBadgeShell)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    cardView.frame = CGRect(
      x: (bounds.width - AgendaDayPickerMetrics.cardWidth) / 2,
      y: AgendaDayPickerMetrics.topOverflowInset + 2,
      width: AgendaDayPickerMetrics.cardWidth,
      height: AgendaDayPickerMetrics.cardHeight
    )
    innerRimView.frame = cardView.bounds.insetBy(dx: 3, dy: 3)
    weekdayLabel.frame = CGRect(x: 5, y: 7, width: 46, height: 14)
    dayNumberLabel.frame = CGRect(x: 3, y: 24, width: 50, height: 28)
    statusBadge.frame = CGRect(x: 3, y: 55, width: 50, height: 15)
    statusLabel.frame = statusBadge.bounds.insetBy(dx: 3, dy: 0)
    monthLabel.frame = CGRect(x: 4, y: 78, width: 48, height: 14)
    footerView.frame = CGRect(x: 7, y: 100, width: 42, height: 16)
    footerLabel.frame = footerView.bounds.insetBy(dx: 2, dy: 0)
    // Il contatore resta sospeso nell'angolo alto, senza scendere sul testo.
    // La larghezza rimane dentro la card, cosi non invade il giorno vicino.
    pendingBadgeShell.frame = CGRect(x: 29, y: -2, width: 26, height: 24)
    pendingBadge.frame = pendingBadgeShell.bounds
  }

  func configure(day: AgendaDayPickerDay, isSelected: Bool) {
    weekdayLabel.text = day.weekdayShort
    dayNumberLabel.text = day.dayNumber
    monthLabel.text = day.monthShort
    statusLabel.text = day.statusLabel
    statusBadge.isHidden = day.statusLabel?.isEmpty != false
    footerLabel.text = isSelected ? day.selectedLabel : day.footerLabel

    let textColor: UIColor = isSelected
      ? UIColor(red: 0.97, green: 0.98, blue: 1, alpha: 1)
      : UIColor(red: 0.04, green: 0.07, blue: 0.13, alpha: 1)
    weekdayLabel.textColor = textColor
    dayNumberLabel.textColor = textColor
    monthLabel.textColor = textColor

    if isSelected {
      cardView.backgroundColor = UIColor(red: 0.082, green: 0.133, blue: 0.22, alpha: 1)
      cardView.layer.borderColor = UIColor(red: 0.41, green: 0.52, blue: 0.72, alpha: 0.72).cgColor
      cardView.layer.borderWidth = 1.2
      cardView.layer.shadowColor = UIColor(red: 0.04, green: 0.10, blue: 0.20, alpha: 1).cgColor
      cardView.layer.shadowOpacity = 0.3
      cardView.layer.shadowRadius = 13
      cardView.layer.shadowOffset = CGSize(width: 0, height: 7)
      innerRimView.layer.borderColor = UIColor(red: 0.36, green: 0.49, blue: 0.72, alpha: 0.22).cgColor
      innerRimView.isHidden = false
      footerView.backgroundColor = UIColor(red: 0.22, green: 0.41, blue: 0.84, alpha: 0.88)
      footerView.layer.borderColor = UIColor(red: 0.80, green: 0.87, blue: 1, alpha: 0.42).cgColor
      footerLabel.textColor = UIColor(red: 0.92, green: 0.95, blue: 1, alpha: 1)
    } else {
      cardView.backgroundColor = day.isClosed
        ? UIColor(red: 0.984, green: 0.878, blue: 0.894, alpha: 1)
        : UIColor(red: 0.824, green: 0.953, blue: 0.878, alpha: 1)
      cardView.layer.borderColor = day.isClosed
        ? UIColor(red: 0.914, green: 0.624, blue: 0.667, alpha: 1).cgColor
        : UIColor(red: 0.561, green: 0.843, blue: 0.678, alpha: 1).cgColor
      cardView.layer.borderWidth = 1
      cardView.layer.shadowOpacity = 0
      innerRimView.isHidden = true
      footerView.backgroundColor = day.isClosed
        ? UIColor(red: 0.965, green: 0.835, blue: 0.855, alpha: 1)
        : UIColor(red: 0.741, green: 0.898, blue: 0.804, alpha: 1)
      footerView.layer.borderColor = UIColor(red: 0.1, green: 0.53, blue: 0.33, alpha: 0.08).cgColor
      footerLabel.textColor = day.isClosed
        ? UIColor(red: 0.78, green: 0.30, blue: 0.34, alpha: 1)
        : UIColor(red: 0.11, green: 0.56, blue: 0.34, alpha: 1)
    }

    statusBadge.backgroundColor = UIColor(red: 0.976, green: 0.855, blue: 0.875, alpha: 0.96)
    statusBadge.layer.borderColor = UIColor(red: 0.875, green: 0.53, blue: 0.58, alpha: 0.9).cgColor
    statusLabel.textColor = UIColor(red: 0.78, green: 0.30, blue: 0.34, alpha: 1)

    if day.isFull == true {
      let neutralText = UIColor(red: 0.39, green: 0.45, blue: 0.55, alpha: 1)
      cardView.backgroundColor = UIColor(red: 0.92, green: 0.94, blue: 0.96, alpha: 1)
      cardView.layer.borderColor = (isSelected ? neutralText : UIColor(red: 0.80, green: 0.84, blue: 0.88, alpha: 1)).cgColor
      weekdayLabel.textColor = neutralText
      dayNumberLabel.textColor = neutralText
      monthLabel.textColor = neutralText
      footerView.backgroundColor = UIColor(red: 0.86, green: 0.89, blue: 0.92, alpha: 1)
      footerLabel.textColor = neutralText
      statusBadge.backgroundColor = UIColor(red: 0.86, green: 0.89, blue: 0.92, alpha: 1)
      statusBadge.layer.borderColor = UIColor(red: 0.80, green: 0.84, blue: 0.88, alpha: 1).cgColor
      statusLabel.textColor = neutralText
    }

    let count = max(0, day.pendingCount)
    pendingBadgeShell.isHidden = count == 0
    pendingBadge.text = count > 9 ? "9+" : "+\(count)"
    cardView.bringSubviewToFront(pendingBadgeShell)
    layer.zPosition = count > 0 ? (isSelected ? 30 : 20) : (isSelected ? 10 : 0)
    accessibilityLabel = [day.weekdayShort, day.dayNumber, day.monthShort, footerLabel.text]
      .compactMap { $0 }
      .joined(separator: ", ")
  }
}

public final class AgendaDayPickerView: ExpoView, UICollectionViewDataSource, UICollectionViewDelegate, UIScrollViewDelegate, UIGestureRecognizerDelegate {
  let onSelectionChange = EventDispatcher()
  let onSelectionDeep = EventDispatcher()
  let onDayLongPress = EventDispatcher()
  let onInteractionStart = EventDispatcher()
  let onInteractionEnd = EventDispatcher()

  private let flowLayout = AgendaDayPickerFlowLayout()
  private lazy var collectionView = AgendaDayPickerCollectionView(frame: .zero, collectionViewLayout: flowLayout)
  private lazy var touchOwnershipRecognizer: UILongPressGestureRecognizer = {
    let recognizer = UILongPressGestureRecognizer(
      target: self,
      action: #selector(handleTouchOwnership(_:))
    )
    recognizer.minimumPressDuration = 0
    recognizer.allowableMovement = .greatestFiniteMagnitude
    recognizer.cancelsTouchesInView = false
    recognizer.delaysTouchesBegan = false
    recognizer.delegate = self
    return recognizer
  }()
  private lazy var dayLongPressRecognizer: UILongPressGestureRecognizer = {
    let recognizer = UILongPressGestureRecognizer(
      target: self,
      action: #selector(handleLongPress(_:))
    )
    recognizer.minimumPressDuration = 0.22
    recognizer.allowableMovement = 8
    recognizer.cancelsTouchesInView = false
    recognizer.delaysTouchesBegan = false
    recognizer.delegate = self
    return recognizer
  }()
  private let glassView = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
  private let glassInnerRim = UIView()
  private var days: [AgendaDayPickerDay] = []
  private var selectedIndex = 0
  private var pendingSelectedIndexBeforeDays: Int?
  private var previewIndex = 0
  private var lastHapticIndex = 0
  private var isApplyingExternalSelection = false
  private var interactionActive = false
  private var selectionGenerator: UISelectionFeedbackGenerator?
  private var pendingHapticPulseCount = 0
  private var hapticPulseTimer: Timer?
  private var pendingFinalizationWorkItem: DispatchWorkItem?
  private var lastViewportSize: CGSize = .zero
  private var awaitingExternalEchoIndex: Int?
  private var deferredExternalSelectionIndex: Int?
  private var settlingSnapIndex: Int?
  private var didFinalizeCurrentInteraction = false
  private var didDragCurrentInteraction = false
  private var touchIsDown = false
  private var interruptedMotionOnCurrentTouch = false
  private var isFreeScrollMode = false
  private var interactionOriginOffsetX: CGFloat = 0
  private var isLongScrollInteraction = false
  private var lastUserSelectionCommitTime: CFTimeInterval = 0
  private var authoritativeUserSelectionIndex: Int?
  private var authoritativeUserSelectionUntil: CFTimeInterval = 0
  private var lastDaysJson = ""
  private var pendingDaysAfterInteraction: [AgendaDayPickerDay]?
  private var lockedAncestorPagerScrollViews: [UIScrollView] = []

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false

    flowLayout.scrollDirection = .horizontal
    flowLayout.itemSize = CGSize(
      width: AgendaDayPickerMetrics.itemWidth,
      height: AgendaDayPickerMetrics.viewportHeight
    )
    flowLayout.minimumLineSpacing = 0
    flowLayout.minimumInteritemSpacing = 0

    collectionView.backgroundColor = .clear
    collectionView.clipsToBounds = false
    collectionView.layer.masksToBounds = false
    collectionView.layer.zPosition = 0
    collectionView.showsHorizontalScrollIndicator = false
    collectionView.showsVerticalScrollIndicator = false
    collectionView.alwaysBounceHorizontal = false
    collectionView.alwaysBounceVertical = false
    collectionView.bounces = false
    collectionView.isPagingEnabled = false
    collectionView.decelerationRate = AgendaDayPickerMetrics.glideDecelerationRate
    collectionView.isDirectionalLockEnabled = true
    collectionView.delaysContentTouches = false
    collectionView.canCancelContentTouches = true
    collectionView.panGestureRecognizer.delaysTouchesBegan = false
    collectionView.panGestureRecognizer.cancelsTouchesInView = true
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.register(
      AgendaDayPickerCell.self,
      forCellWithReuseIdentifier: AgendaDayPickerCell.reuseIdentifier
    )
    collectionView.onImmediateTouchBegan = { [weak self] in
      self?.handleImmediateTouchBegan()
    }
    collectionView.addGestureRecognizer(touchOwnershipRecognizer)
    addSubview(collectionView)

    glassView.isUserInteractionEnabled = false
    glassView.alpha = 0.06
    glassView.layer.cornerRadius = 27
    glassView.layer.cornerCurve = .continuous
    glassView.clipsToBounds = true
    glassView.layer.borderWidth = 1.15
    glassView.layer.borderColor = UIColor(red: 0.32, green: 0.44, blue: 0.64, alpha: 0.48).cgColor
    glassView.layer.shadowColor = UIColor(red: 0.08, green: 0.16, blue: 0.28, alpha: 1).cgColor
    glassView.layer.shadowOpacity = 0.2
    glassView.layer.shadowRadius = 14
    glassView.layer.shadowOffset = CGSize(width: 0, height: 6)
    glassView.layer.zPosition = 1_000
    addSubview(glassView)

    glassInnerRim.isUserInteractionEnabled = false
    glassInnerRim.backgroundColor = .clear
    glassInnerRim.layer.cornerRadius = 25
    glassInnerRim.layer.cornerCurve = .continuous
    glassInnerRim.layer.borderWidth = 0.7
    glassInnerRim.layer.borderColor = UIColor(red: 0.82, green: 0.88, blue: 1, alpha: 0.38).cgColor
    glassInnerRim.layer.zPosition = 1_001
    addSubview(glassInnerRim)

    let singleTap = UITapGestureRecognizer(target: self, action: #selector(handleSingleTap(_:)))
    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
    doubleTap.numberOfTapsRequired = 2
    singleTap.cancelsTouchesInView = false
    singleTap.delaysTouchesBegan = false
    doubleTap.cancelsTouchesInView = false
    doubleTap.delaysTouchesBegan = false
    singleTap.require(toFail: collectionView.panGestureRecognizer)
    doubleTap.require(toFail: collectionView.panGestureRecognizer)
    singleTap.require(toFail: doubleTap)
    collectionView.addGestureRecognizer(singleTap)
    collectionView.addGestureRecognizer(doubleTap)

    collectionView.addGestureRecognizer(dayLongPressRecognizer)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    collectionView.frame = bounds
    collectionView.clipsToBounds = false
    collectionView.layer.masksToBounds = false
    prioritizePickerPanOverAncestors()

    let lensWidth: CGFloat = 70
    glassView.frame = CGRect(
      x: (bounds.width - lensWidth) / 2,
      y: AgendaDayPickerMetrics.topOverflowInset + 1,
      width: lensWidth,
      height: max(0, bounds.height - AgendaDayPickerMetrics.topOverflowInset - 2)
    )
    glassInnerRim.frame = glassView.frame.insetBy(dx: 2, dy: 2)
    bringSubviewToFront(glassView)
    bringSubviewToFront(glassInnerRim)

    guard bounds.size != .zero, bounds.size != lastViewportSize else { return }
    lastViewportSize = bounds.size
    updateSectionInsets()
    collectionView.collectionViewLayout.invalidateLayout()
    collectionView.layoutIfNeeded()
    if !interactionActive && !touchIsDown {
      scrollToIndex(selectedIndex, animated: false)
    }
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else {
      touchIsDown = false
      finishInteraction()
      return
    }
    prioritizePickerPanOverAncestors()
    DispatchQueue.main.async { [weak self] in
      self?.prioritizePickerPanOverAncestors()
    }
  }

  func setDays(_ nextDays: [AgendaDayPickerDay]) {
    // reloadData can interrupt deceleration or the final native snap without
    // delivering scrollViewDidEndScrollingAnimation. Apply only the latest
    // server refresh once the user's interaction has released ownership.
    if interactionActive || touchIsDown || collectionView.isDragging || collectionView.isDecelerating {
      pendingDaysAfterInteraction = nextDays
      return
    }
    let selectedValue = days.indices.contains(selectedIndex) ? days[selectedIndex].value : nil
    days = nextDays
    if let pendingSelectedIndexBeforeDays {
      selectedIndex = boundedIndex(pendingSelectedIndexBeforeDays)
      self.pendingSelectedIndexBeforeDays = nil
    } else if let selectedValue, let matchingIndex = days.firstIndex(where: { $0.value == selectedValue }) {
      selectedIndex = matchingIndex
    } else {
      selectedIndex = boundedIndex(selectedIndex)
    }
    previewIndex = selectedIndex
    lastHapticIndex = selectedIndex
    collectionView.reloadData()
    collectionView.layoutIfNeeded()
    if !interactionActive {
      scrollToIndex(selectedIndex, animated: false)
    }
    refreshVisibleSelection(
      previous: nil,
      current: isFreeScrollMode ? nil : previewIndex
    )
  }

  func setDaysJson(_ json: String) {
    guard json != lastDaysJson else { return }
    guard
      let data = json.data(using: .utf8),
      let decodedDays = try? JSONDecoder().decode([AgendaDayPickerDay].self, from: data)
    else {
      return
    }
    lastDaysJson = json
    setDays(decodedDays)
  }

  func setSelectedIndex(_ nextIndex: Int) {
    // Le prop Expo non hanno un ordine di applicazione garantito. Se l'indice
    // arriva prima di daysJson non va limitato a zero: lo conserviamo grezzo e
    // lo applichiamo non appena l'elenco e disponibile.
    guard !days.isEmpty else {
      pendingSelectedIndexBeforeDays = max(0, nextIndex)
      return
    }
    let bounded = boundedIndex(nextIndex)
    let now = CACurrentMediaTime()

    // Dopo un aggancio nativo l'ultimo giorno scelto resta l'unica autorita'
    // per il breve tempo necessario al round-trip React. Un valore precedente
    // puo' arrivare in ritardo dopo un secondo gesto: va scartato, mai accodato
    // o applicato, altrimenti il vetro rimbalza sul vecchio giorno.
    if let authoritativeIndex = authoritativeUserSelectionIndex,
       now < authoritativeUserSelectionUntil {
      if bounded == authoritativeIndex {
        awaitingExternalEchoIndex = nil
      }
      return
    }
    authoritativeUserSelectionIndex = nil

    if interactionActive {
      if bounded == awaitingExternalEchoIndex {
        awaitingExternalEchoIndex = nil
        deferredExternalSelectionIndex = nil
      } else {
        // Un aggiornamento esterno arrivato mentre il dito possiede il picker
        // appartiene alla selezione precedente e non deve sopravvivere al gesto.
        deferredExternalSelectionIndex = nil
      }
      return
    }

    if let awaitingIndex = awaitingExternalEchoIndex {
      if bounded == awaitingIndex {
        awaitingExternalEchoIndex = nil
        deferredExternalSelectionIndex = nil
        return
      } else if CACurrentMediaTime() - lastUserSelectionCommitTime < 1.25 {
        deferredExternalSelectionIndex = bounded
        return
      } else {
        awaitingExternalEchoIndex = nil
      }
    }
    guard bounded != selectedIndex || previewIndex != bounded else { return }
    selectedIndex = bounded
    previewIndex = bounded
    lastHapticIndex = bounded
    deferredExternalSelectionIndex = nil
    isApplyingExternalSelection = true
    scrollToIndex(bounded, animated: false)
    refreshVisibleSelection(previous: nil, current: bounded)
    isApplyingExternalSelection = false
  }

  public func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
    days.count
  }

  public func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    guard let cell = collectionView.dequeueReusableCell(
      withReuseIdentifier: AgendaDayPickerCell.reuseIdentifier,
      for: indexPath
    ) as? AgendaDayPickerCell else {
      return UICollectionViewCell()
    }
    cell.configure(
      day: days[indexPath.item],
      isSelected: !isFreeScrollMode && indexPath.item == previewIndex
    )
    return cell
  }

  public func collectionView(
    _ collectionView: UICollectionView,
    willDisplay cell: UICollectionViewCell,
    forItemAt indexPath: IndexPath
  ) {
    guard
      days.indices.contains(indexPath.item),
      let dayCell = cell as? AgendaDayPickerCell
    else {
      return
    }
    dayCell.configure(
      day: days[indexPath.item],
      isSelected: !isFreeScrollMode && indexPath.item == previewIndex
    )
  }

  public func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    beginInteractionIfNeeded()
    cancelPendingHaptics()
    cancelPendingFinalization()
    settlingSnapIndex = nil
    didFinalizeCurrentInteraction = false
    didDragCurrentInteraction = true
    interruptedMotionOnCurrentTouch = false
    isFreeScrollMode = true
    collectionView.decelerationRate = AgendaDayPickerMetrics.glideDecelerationRate
    selectionGenerator = UISelectionFeedbackGenerator()
    selectionGenerator?.prepare()
    lastHapticIndex = nearestIndex(for: scrollView.contentOffset.x)
    refreshVisibleSelection(previous: previewIndex, current: nil)
    setGlassActive(true)
  }

  public func scrollViewDidScroll(_ scrollView: UIScrollView) {
    guard
      !isApplyingExternalSelection,
      scrollView.isTracking || scrollView.isDragging || scrollView.isDecelerating
    else {
      return
    }
    let nextIndex = nearestIndex(for: scrollView.contentOffset.x)
    let travelledDistance = abs(
      scrollView.contentOffset.x - interactionOriginOffsetX
    )
    let horizontalVelocity = abs(
      collectionView.panGestureRecognizer.velocity(in: collectionView).x
    )
    if travelledDistance >= AgendaDayPickerMetrics.itemWidth * 3.0 ||
       horizontalVelocity >= 1_000 {
      isLongScrollInteraction = true
    }
    guard nextIndex != lastHapticIndex else { return }
    let crossedItems = abs(nextIndex - lastHapticIndex)
    lastHapticIndex = nextIndex
    emitSelectionHaptics(crossedItems)
  }

  public func scrollViewWillEndDragging(
    _ scrollView: UIScrollView,
    withVelocity velocity: CGPoint,
    targetContentOffset: UnsafeMutablePointer<CGPoint>
  ) {
    // Nessuna destinazione viene prevista o conservata al rilascio. La lista
    // prosegue con l'inerzia nativa; l'unico aggancio avviene quando il moto si
    // e' fermato davvero, usando la card che in quel momento e' sotto il vetro.
  }

  public func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    guard !decelerate else { return }
    scheduleFinalization(scrollView)
  }

  public func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    guard !touchIsDown else { return }
    scheduleFinalization(scrollView)
  }

  public func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    guard
      !touchIsDown,
      interactionActive,
      didFinalizeCurrentInteraction,
      let nextIndex = settlingSnapIndex
    else {
      return
    }
    settlingSnapIndex = nil
    completeFinalSnap(nextIndex)
  }

  @objc private func handleSingleTap(_ recognizer: UITapGestureRecognizer) {
    guard
      recognizer.state == .ended,
      !isFreeScrollMode,
      !didDragCurrentInteraction,
      !interruptedMotionOnCurrentTouch,
      !collectionView.isDragging,
      !collectionView.isDecelerating
    else {
      return
    }
    let index = index(at: recognizer.location(in: collectionView))
    scrollToIndex(index, animated: false)
    commitSelection(index, deep: false)
    finishInteraction()
  }

  @objc private func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
    guard
      recognizer.state == .ended,
      !isFreeScrollMode,
      !didDragCurrentInteraction,
      !interruptedMotionOnCurrentTouch,
      !collectionView.isDragging,
      !collectionView.isDecelerating
    else {
      return
    }
    let index = index(at: recognizer.location(in: collectionView))
    scrollToIndex(index, animated: false)
    commitSelection(index, deep: true)
    finishInteraction()
  }

  @objc private func handleLongPress(_ recognizer: UILongPressGestureRecognizer) {
    guard
      recognizer.state == .began,
      !days.isEmpty,
      !isFreeScrollMode,
      !didDragCurrentInteraction,
      !collectionView.isDragging,
      !collectionView.isDecelerating
    else {
      return
    }
    let index = index(at: recognizer.location(in: collectionView))
    let generator = UIImpactFeedbackGenerator(style: .medium)
    generator.impactOccurred()
    onDayLongPress(["index": index, "value": days[index].value])
  }

  @objc private func handleTouchOwnership(_ recognizer: UILongPressGestureRecognizer) {
    switch recognizer.state {
    case .began:
      if !touchIsDown {
        handleImmediateTouchBegan()
      }
    case .ended, .cancelled, .failed:
      touchIsDown = false
      if (interruptedMotionOnCurrentTouch || didDragCurrentInteraction) &&
         !collectionView.isDragging &&
         !collectionView.isDecelerating {
        interruptedMotionOnCurrentTouch = false
        scheduleFinalization(collectionView)
      } else if !didDragCurrentInteraction &&
                !collectionView.isDragging &&
                !collectionView.isDecelerating {
        finishInteraction()
      }
    default:
      break
    }
  }

  public func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    if gestureRecognizer === touchOwnershipRecognizer ||
       otherGestureRecognizer === touchOwnershipRecognizer {
      return true
    }
    return (
      gestureRecognizer === dayLongPressRecognizer &&
      otherGestureRecognizer === collectionView.panGestureRecognizer
    ) || (
      otherGestureRecognizer === dayLongPressRecognizer &&
      gestureRecognizer === collectionView.panGestureRecognizer
    )
  }

  private func updateSectionInsets() {
    let inset = max(0, (bounds.width - AgendaDayPickerMetrics.itemWidth) / 2)
    flowLayout.sectionInset = UIEdgeInsets(top: 0, left: inset, bottom: 0, right: inset)
  }

  private func prioritizePickerPanOverAncestors() {
    let pickerPan = collectionView.panGestureRecognizer
    var ancestor = superview
    while let view = ancestor {
      view.gestureRecognizers?.forEach { recognizer in
        guard
          recognizer !== pickerPan,
          recognizer is UIPanGestureRecognizer
        else {
          return
        }
        recognizer.require(toFail: pickerPan)
        recognizer.require(toFail: touchOwnershipRecognizer)
      }
      ancestor = view.superview
    }
  }

  private func lockAncestorPagerScrolling() {
    guard lockedAncestorPagerScrollViews.isEmpty else { return }

    var ancestor = superview
    while let view = ancestor {
      if let scrollView = view as? UIScrollView,
         scrollView !== collectionView {
        let className = NSStringFromClass(type(of: scrollView)).lowercased()
        let isHorizontalPager =
          scrollView.isPagingEnabled ||
          className.contains("pager") ||
          className.contains("pageview") ||
          scrollView.contentSize.width > scrollView.bounds.width + 1

        if isHorizontalPager && scrollView.isScrollEnabled {
          scrollView.isScrollEnabled = false
          lockedAncestorPagerScrollViews.append(scrollView)
        }
      }
      ancestor = view.superview
    }
  }

  private func unlockAncestorPagerScrolling() {
    lockedAncestorPagerScrollViews.forEach { scrollView in
      scrollView.isScrollEnabled = true
    }
    lockedAncestorPagerScrollViews.removeAll()
  }

  private func boundedIndex(_ index: Int) -> Int {
    guard !days.isEmpty else { return 0 }
    return min(max(0, index), days.count - 1)
  }

  private func nearestIndex(for contentOffsetX: CGFloat) -> Int {
    boundedIndex(Int(round(contentOffsetX / AgendaDayPickerMetrics.itemWidth)))
  }

  private func offset(for index: Int) -> CGFloat {
    CGFloat(boundedIndex(index)) * AgendaDayPickerMetrics.itemWidth
  }

  private func index(at point: CGPoint) -> Int {
    // Il tap deve appartenere alla cella UIKit realmente toccata. Ricavare
    // l'indice da contentOffset e coordinate arrotondate puo' sommare due
    // sistemi di riferimento diversi durante un assestamento e saltare a un
    // giorno lontano. La collection view possiede gia' la risposta esatta.
    if let indexPath = collectionView.indexPathForItem(at: point) {
      return boundedIndex(indexPath.item)
    }

    // Fallback solo per i pochi pixel esterni alle celle sovrapposte.
    let centeredDistance = point.x - bounds.midX
    return boundedIndex(Int(round(collectionView.contentOffset.x / AgendaDayPickerMetrics.itemWidth + centeredDistance / AgendaDayPickerMetrics.itemWidth)))
  }

  private func scrollToIndex(_ index: Int, animated: Bool) {
    guard !days.isEmpty, bounds.width > 0 else { return }
    collectionView.setContentOffset(CGPoint(x: offset(for: index), y: 0), animated: animated)
  }

  private func finalizeScrollInteraction(_ scrollView: UIScrollView) {
    guard interactionActive, !didFinalizeCurrentInteraction else { return }
    pendingFinalizationWorkItem = nil
    didFinalizeCurrentInteraction = true
    // Questo e' l'unico punto di aggancio dello scroll: si legge la posizione
    // reale soltanto dopo l'arresto, senza riusare indici calcolati prima.
    let nextIndex = nearestIndex(for: scrollView.contentOffset.x)
    let targetOffset = offset(for: nextIndex)
    if abs(scrollView.contentOffset.x - targetOffset) > 0.5 {
      // Dopo l'inerzia la card piu' vicina entra sotto il vetro con una breve
      // centratura nativa. Finche' questa animazione non termina non mostriamo
      // alcuna selezione e non inviamo alcuna data a React.
      settlingSnapIndex = nextIndex
      scrollView.setContentOffset(
        CGPoint(x: targetOffset, y: 0),
        animated: true
      )
      // UIKit may omit the completion callback when a layout refresh
      // interrupts setContentOffset. Never leave the picker owning the pager.
      let recovery = DispatchWorkItem { [weak self] in
        guard let self,
          self.interactionActive,
          self.settlingSnapIndex == nextIndex,
          !self.touchIsDown,
          !self.collectionView.isTracking,
          !self.collectionView.isDragging,
          !self.collectionView.isDecelerating
        else { return }
        self.collectionView.setContentOffset(CGPoint(x: self.offset(for: nextIndex), y: 0), animated: false)
        self.completeFinalSnap(nextIndex)
      }
      pendingFinalizationWorkItem = recovery
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: recovery)
      return
    }
    completeFinalSnap(nextIndex)
  }

  private func completeFinalSnap(_ nextIndex: Int) {
    isFreeScrollMode = false
    collectionView.decelerationRate = AgendaDayPickerMetrics.glideDecelerationRate
    commitSelection(nextIndex, deep: false)
    finishInteraction()
  }

  private func commitSelection(_ index: Int, deep: Bool) {
    guard !days.isEmpty else { return }
    let bounded = boundedIndex(index)
    if !deep,
       bounded == selectedIndex,
       bounded == previewIndex,
       awaitingExternalEchoIndex == bounded {
      refreshVisibleSelection(previous: nil, current: bounded)
      return
    }
    let previous = previewIndex
    selectedIndex = bounded
    previewIndex = bounded
    lastHapticIndex = bounded
    awaitingExternalEchoIndex = bounded
    deferredExternalSelectionIndex = nil
    lastUserSelectionCommitTime = CACurrentMediaTime()
    authoritativeUserSelectionIndex = bounded
    authoritativeUserSelectionUntil = lastUserSelectionCommitTime + 2.5
    refreshVisibleSelection(previous: previous, current: bounded)
    let payload: [String: Any] = ["index": bounded, "value": days[bounded].value]
    if deep {
      onSelectionDeep(payload)
    } else {
      onSelectionChange(payload)
    }
  }

  private func refreshVisibleSelection(previous: Int?, current: Int?) {
    if let previous,
       previous != current,
       days.indices.contains(previous),
       let previousCell = collectionView.cellForItem(
         at: IndexPath(item: previous, section: 0)
       ) as? AgendaDayPickerCell {
      previousCell.configure(day: days[previous], isSelected: false)
    }
    collectionView.indexPathsForVisibleItems.forEach { indexPath in
      guard
        days.indices.contains(indexPath.item),
        let cell = collectionView.cellForItem(at: indexPath) as? AgendaDayPickerCell
      else {
        return
      }
      cell.configure(
        day: days[indexPath.item],
        isSelected: current == indexPath.item
      )
    }
  }

  private func beginInteractionIfNeeded() {
    guard !interactionActive else { return }
    interactionActive = true
    didFinalizeCurrentInteraction = false
    didDragCurrentInteraction = false
    isFreeScrollMode = false
    interactionOriginOffsetX = collectionView.contentOffset.x
    isLongScrollInteraction = false
    lockAncestorPagerScrolling()
    onInteractionStart([:])
  }

  private func handleImmediateTouchBegan() {
    cancelPendingFinalization()
    let interruptedSettlingSnap = settlingSnapIndex != nil
    let interruptedMotion =
      collectionView.isDecelerating ||
      interruptedSettlingSnap ||
      (interactionActive &&
       isFreeScrollMode &&
       didDragCurrentInteraction &&
       !didFinalizeCurrentInteraction)
    touchIsDown = true
    interruptedMotionOnCurrentTouch = interruptedMotion

    if interruptedMotion {
      // Un nuovo dito rende definitivamente obsoleta la chiusura del moto
      // precedente. Fermiamo esplicitamente soltanto l'eventuale centratura
      // finale; l'inerzia naturale non va azzerata, cosi' il nuovo impulso puo'
      // proseguire la corsa senza lo scatto frenato del secondo contatto.
      settlingSnapIndex = nil
      didFinalizeCurrentInteraction = false
      isFreeScrollMode = true
      if interruptedSettlingSnap {
        let visibleOffset = collectionView.contentOffset
        collectionView.setContentOffset(visibleOffset, animated: false)
      }
      refreshVisibleSelection(previous: previewIndex, current: nil)
    }

    beginInteractionIfNeeded()
    prioritizePickerPanOverAncestors()
  }

  private func setGlassActive(_ active: Bool) {
    UIView.animate(
      withDuration: active ? 0.10 : 0.16,
      delay: 0,
      options: [.beginFromCurrentState, .allowUserInteraction]
    ) {
      self.glassView.alpha = active ? 0.18 : 0.06
      self.glassView.transform = active ? CGAffineTransform(scaleX: 1.025, y: 1.015) : .identity
      self.glassInnerRim.alpha = active ? 1 : 0.82
    }
  }

  private func finishInteraction() {
    cancelPendingHaptics()
    cancelPendingFinalization()
    selectionGenerator = nil
    settlingSnapIndex = nil
    didFinalizeCurrentInteraction = false
    didDragCurrentInteraction = false
    interruptedMotionOnCurrentTouch = false
    isFreeScrollMode = false
    setGlassActive(false)
    if interactionActive {
      interactionActive = false
      unlockAncestorPagerScrolling()
      onInteractionEnd([:])
    }

    if let pendingDays = pendingDaysAfterInteraction {
      pendingDaysAfterInteraction = nil
      setDays(pendingDays)
    }

    if awaitingExternalEchoIndex == nil,
       let deferred = deferredExternalSelectionIndex,
       deferred != selectedIndex {
      deferredExternalSelectionIndex = nil
      setSelectedIndex(deferred)
    }
  }

  private func emitSelectionHaptics(_ crossedItems: Int) {
    pendingHapticPulseCount = min(
      pendingHapticPulseCount + min(max(crossedItems, 1), 8),
      8
    )
    drainHapticPulseQueueIfNeeded()
  }

  private func emitSelectionPulse() {
    let generator = selectionGenerator ?? UISelectionFeedbackGenerator()
    selectionGenerator = generator
    generator.selectionChanged()
    generator.prepare()
  }

  private func cancelPendingHaptics() {
    hapticPulseTimer?.invalidate()
    hapticPulseTimer = nil
    pendingHapticPulseCount = 0
  }

  private func drainHapticPulseQueueIfNeeded() {
    guard hapticPulseTimer == nil, pendingHapticPulseCount > 0 else { return }
    emitSelectionPulse()
    pendingHapticPulseCount -= 1
    guard pendingHapticPulseCount > 0 else { return }

    let timer = Timer(timeInterval: 0.014, repeats: true) { [weak self] timer in
      guard let self, self.pendingHapticPulseCount > 0 else {
        timer.invalidate()
        self?.hapticPulseTimer = nil
        return
      }
      self.emitSelectionPulse()
      self.pendingHapticPulseCount -= 1
      if self.pendingHapticPulseCount == 0 {
        timer.invalidate()
        self.hapticPulseTimer = nil
      }
    }
    hapticPulseTimer = timer
    RunLoop.main.add(timer, forMode: .common)
  }

  private func scheduleFinalization(_ scrollView: UIScrollView) {
    cancelPendingFinalization()
    let workItem = DispatchWorkItem { [weak self, weak scrollView] in
      guard
        let self,
        let scrollView,
        !self.touchIsDown,
        !scrollView.isTracking,
        !scrollView.isDragging,
        !scrollView.isDecelerating
      else {
        return
      }
      self.pendingFinalizationWorkItem = nil
      self.finalizeScrollInteraction(scrollView)
    }
    pendingFinalizationWorkItem = workItem
    let quietWindow = isLongScrollInteraction ? 0.65 : 0.11
    DispatchQueue.main.asyncAfter(
      deadline: .now() + quietWindow,
      execute: workItem
    )
  }

  private func cancelPendingFinalization() {
    pendingFinalizationWorkItem?.cancel()
    pendingFinalizationWorkItem = nil
  }
}
