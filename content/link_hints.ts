const enum ClickType {
  Default = 0,
  click = Default, edit, listener,
  classname = 4, tabindex,
  maxNotBox = 6, minBox = maxNotBox + 1,
  frame = minBox, scrollX, scrollY,
}
const enum ClickingType {
  NotWantClickable = 0,
  WantButNotFind = 1,
  FindClickable = 2,
}
declare namespace HintsNS {
  type LinkEl = Hint[0];
  interface ModeOpt {
    [mode: number]: string | undefined;
    activator_ (this: {}, linkEl: LinkEl, rect: VRect | null, hintEl: HintsNS.HintItem): void | false;
  }
  interface Options extends SafeObject {
    action?: string;
    mode?: string | number;
    url?: boolean;
    keyword?: string;
    force?: boolean;
  }
  type NestedFrame = false | 0 | null | HTMLIFrameElement | HTMLFrameElement;
  interface ElementIterator<T> {
    (this: { [index: number]: Element, length: number}, fn: (this: T[], value: Element) => void, self: T[]): void;
  }
  interface Filter<T> {
    (this: T[], element: Element): void;
  }
  type LinksMatched = false | null | HintItem[];
  type Stack = number[];
  type Stacks = Stack[];
  interface KeyStatus {
    known: boolean;
    newHintLength: number;
    tab: 0 | 1;
  }
  interface ElementList { readonly length: number; [index: number]: Element; }
}

var VHints = {
  CONST_: {
    focus: HintMode.FOCUS,
    hover: HintMode.HOVER,
    leave: HintMode.LEAVE,
    unhover: HintMode.LEAVE,
    text: HintMode.COPY_TEXT,
    "copy-text": HintMode.COPY_TEXT,
    url: HintMode.COPY_LINK_URL,
    image: HintMode.OPEN_IMAGE
  } as Dict<HintMode>,
  box_: null as HTMLDivElement | null,
  hints_: null as HintsNS.HintItem[] | null,
  mode_: 0 as HintMode,
  mode1_: 0 as HintMode,
  modeOpt_: null as HintsNS.ModeOpt | null,
  clicking_: ClickingType.NotWantClickable,
  forHover_: false,
  count_: 0,
  lastMode_: 0 as HintMode,
  tooHigh_: false as null | boolean,
  pTimer_: 0, // promptTimer
  isClickListened_: true,
  ngEnabled_: null as boolean | null,
  keyStatus_: {
    known: false,
    newHintLength: 0,
    tab: 0
  } as HintsNS.KeyStatus,
  isActive_: false,
  noHUD_: false,
  options_: null as never as HintsNS.Options,
  timer_: 0,
  activate (this: void, count: number, options: FgOptions): void {
    const a = VHints;
    if (a.isActive_) { return; }
    if (document.body == null) {
      a.clean_();
      if (!a.timer_ && document.readyState === "loading") {
        a.timer_ = setTimeout(a.activate.bind(a, count, options), 300);
        return;
      }
      if (!VDom.isHTML_()) { return; }
    }
    VUtils.remove_(a);
    a.setModeOpt_((count as number) | 0, options);
    let str = options.characters ? options.characters + "" : VSettings.cache.linkHintCharacters;
    if (str.length < 3) {
      a.clean_(true);
      return VHUD.showForDuration("Characters for LinkHints are too few.", 1000);
    }
    a.alphabetHints_.chars_ = str.toUpperCase();

    const arr: ViewBox = VDom.getViewBox_(1) as ViewBox;
    VDom.prepareCrop_();
    if (a.tooHigh_ !== null) {
      a.tooHigh_ = (VDom.scrollingEl_() || document.documentElement as HTMLElement).scrollHeight / window.innerHeight > 20;
    }
    let elements = a.getVisibleElements_(arr);
    if (a.frameNested_) {
      if (a.tryNestedFrame_("VHints", "activate", (count as number) | 0, options)) {
        return a.clean_();
      }
    }
    if (elements.length === 0) {
      elements = a.retryShadowDOM_(arr);
      if (elements.length === 0) {
        a.clean_(true);
        return VHUD.showForDuration("No links to select.", 1000);
      }
    }

    if (a.box_) { a.box_.remove(); a.box_ = null; }
    a.hints_ = elements.map(a.createHint_, a);
    VDom.bZoom_ !== 1 && a.adjustMarkers_(elements);
    elements = null as never;
    a.alphabetHints_.initMarkers_(a.hints_);

    a.noHUD_ = arr[3] <= 40 || arr[2] <= 320 || (options.hideHUD || options.hideHud) === true;
    VDom.UI.ensureBorder_(VDom.wdZoom_);
    a.setMode_(a.mode_, false);
    a.box_ = VDom.UI.addElementList_(a.hints_, arr);

    a.isActive_ = true;
    VUtils.push_(a.onKeydown_, a);
    VEventMode.onWndBlur_(a.ResetMode_);
  },
  setModeOpt_ (count: number, options: HintsNS.Options): void {
    if (this.options_ === options) { return; }
    let ref = this.Modes_, modeOpt: HintsNS.ModeOpt | undefined,
    mode = (<number>options.mode > 0 ? options.mode as number
      : this.CONST_[options.action || options.mode as string] as number | undefined | Function as number) | 0;
    if (mode === HintMode.EDIT_TEXT && options.url) {
      mode = HintMode.EDIT_LINK_URL;
    }
    count = Math.abs(count);
    if (count > 1) { mode < HintMode.min_disable_queue ? (mode |= HintMode.queue) : (count = 1); }
    for (const i in ref) {
      if (ref.hasOwnProperty(i) && ((ref as Dict<HintsNS.ModeOpt>)[i] as HintsNS.ModeOpt).hasOwnProperty(mode)) {
        modeOpt = (ref as Dict<HintsNS.ModeOpt>)[i] as HintsNS.ModeOpt;
        break;
      }
    }
    if (!modeOpt) {
      modeOpt = ref.DEFAULT_;
      mode = count > 1 ? HintMode.OPEN_WITH_QUEUE : HintMode.OPEN_IN_CURRENT_TAB;
    }
    this.modeOpt_ = modeOpt;
    this.options_ = options;
    this.count_ = count;
    return this.setMode_(mode, true);
  },
  setMode_ (mode: HintMode, slient?: boolean): void {
    this.lastMode_ = this.mode_ = mode;
    this.mode1_ = mode = mode & ~HintMode.queue;
    this.forHover_ = mode >= HintMode.HOVER && mode <= HintMode.LEAVE;
    if (slient || this.noHUD_) { return; }
    if (this.pTimer_ < 0) {
      this.pTimer_ = setTimeout(this.SetHUDLater_, 1000);
      return;
    }
    return VHUD.show_((this.modeOpt_ as HintsNS.ModeOpt)[this.mode_] as string, true);
  },
  SetHUDLater_ (this: void): void {
    const a = VHints;
    if (a && a.isActive_) { a.pTimer_ = 0; return a.setMode_(a.mode_); }
  },
  ActivateAndFocus_ (this: void, a: number, b: FgOptions): void {
    return VEventMode.focusAndListen_(() => {
      VHints.isActive_ = false;
      VHints.activate(a, b);
    });
  },
  tryNestedFrame_ (mode: "VHints" | "VScroller" | "Vomnibar", action: string, a: number, b: SafeObject): boolean {
    if (this.frameNested_ !== null) {
      mode !== "VHints" && VDom.prepareCrop_();
      this.checkNestedFrame_();
    }
    interface VWindow extends Window {
      VHints: typeof VHints,
      VScroller: typeof VScroller;
      Vomnibar: typeof Vomnibar;
      VEventMode: VEventMode,
      VDom: typeof VDom;
    }
    let frame = this.frameNested_, child: VWindow = null as never, err = true, done = false;
    if (!frame) { return false; }
    try {
      if (frame.contentDocument && (child = frame.contentWindow as VWindow).VDom.isHTML_()) {
        if (mode === "VHints") {
          (done = child.VHints.isActive_) && child.VHints.deactivate_(true);
        }
        err = child.VEventMode.keydownEvents(VEventMode.keydownEvents());
      }
    } catch (e) {}
    if (err) {
      // It's cross-site, or Vimium C on the child is wholly disabled
      // * Cross-site: it's in an abnormal situation, so we needn't focus the child;
      this.frameNested_ = null;
      return false;
    }
    child.VEventMode.focusAndListen_(done ? null : function(): void {
      return (child[mode as "VHints"])[action as "activate"](a, b);
    });
    if (done) { return true; }
    if (document.readyState !== "complete") { this.frameNested_ = false; }
    return true;
  },
  retryShadowDOM_ (view: ViewBox): Hint[] {
    let elements: Hint[] = [];
    if (this.clicking_ === ClickingType.WantButNotFind && !this.tooHigh_) {
      const {cache} = VSettings;
      if (!cache.deepHints) {
        cache.deepHints = true;
        elements = this.getVisibleElements_(view);
      }
      if (elements.length === 0 && !this.switchShadowVer_()) {
        elements = this.getVisibleElements_(view);
      }
    }
    return elements;
  },
  maxLeft_: 0,
  maxTop_: 0,
  maxRight_: 0,
  zIndexes_: null as null | false | HintsNS.Stacks,
  createHint_ (link: Hint): HintsNS.HintItem {
    let marker = VDom.createElement_("span") as HintsNS.HintItem["marker"], i: number;
    i = link.length < 4 ? link[1][0] : (link as Hint4)[3][0][0] + (link as Hint4)[3][1];
    const hint: HintsNS.HintItem = {
      marker, target: link[0],
      key: "",
      refer: link.length > 4 ? (link as Hint5)[4] : null,
    };
    if (link[2] < ClickType.minBox) {
      marker.className = "LH";
    } else {
      marker.className = "LH BH";
      hint.refer = link[0];
    }
    const st = marker.style;
    st.left = i + "px";
    if (i > this.maxLeft_ && this.maxRight_) {
      st.maxWidth = this.maxRight_ - i + "px";
    }
    i = link[1][1];
    st.top = i + "px";
    if (i > this.maxTop_) {
      st.maxHeight = this.maxTop_ - i + PixelConsts.MaxHeightOfLinkHintMarker + "px";
    }
    return hint;
  },
  adjustMarkers_ (elements: Hint[]): void {
    const zi = VDom.bZoom_, root = VDom.UI.R;
    let i = elements.length - 1;
    if (!root || elements[i][0] !== Vomnibar.box_ && !root.querySelector('#HelpDialog')) { return; }
    const z = ("" + 1 / zi).substring(0, 5), arr = this.hints_ as HintsNS.HintItem[],
    mr = this.maxRight_ * zi, mt = this.maxTop_ * zi;
    while (0 <= i && root.contains(elements[i][0])) {
      let st = arr[i--].marker.style;
      st.zoom = z;
      st.maxWidth && (st.maxWidth = mr - elements[i][1][0] + "px");
      st.maxHeight && (st.maxHeight = mt - elements[i][1][1] + 18 + "px");
    }
  },
  btnRe_: <RegExpOne> /\b(?:[Bb](?:utto|t)n|[Cc]lose)(?:$|\s)/,
  /**
   * Must ensure only call `VScroller.shouldScroll` during `@getVisibleElements`
   */
  GetClickable_ (this: Hint[], element: Element): void {
    let arr: VRect | null, isClickable = null as boolean | null, s: string | null, type = ClickType.Default;
    if (!(element instanceof HTMLElement) || element instanceof HTMLFormElement) {
      if (element instanceof SVGElement) {
        type = element.vimiumHasOnclick || element.getAttribute("onclick")
            || VHints.ngEnabled_ && element.getAttribute("ng-click")
            || (s = element.getAttribute("jsaction")) && VHints.checkJSAction_(s) ? ClickType.listener
          : (s = element.getAttribute("tabindex")) && parseInt(s, 10) >= 0 ? ClickType.tabindex
          : type;
        if (type > ClickType.Default && (arr = VDom.getVisibleClientRect_(element))) {
          this.push([element, arr, type]);
        }
      }
      return;
    }
    switch (element.tagName.toLowerCase()) {
    case "a": case "details": isClickable = true; break;
    case "frame": case "iframe":
      if (element === Vomnibar.box_) {
        if (arr = VDom.getVisibleClientRect_(element)) {
          (arr as WritableVRect)[0] += 10.5; (arr as WritableVRect)[1] += 8;
          this.push([element, arr, ClickType.frame]);
        }
        return;
      }
      isClickable = element !== VFindMode.box_;
      type = isClickable ? ClickType.frame : ClickType.Default;
      break;
    case "input":
      if ((element as HTMLInputElement).type === "hidden") { return; } // no break;
    case "textarea":
      if ((element as HTMLTextAreaElement | HTMLInputElement).disabled && VHints.mode1_ <= HintMode.LEAVE) { return; }
      if (!(element as HTMLTextAreaElement | HTMLInputElement).readOnly || VHints.mode_ >= HintMode.min_job
        || element instanceof HTMLInputElement && (element.type in VDom.uneditableInputs_)) {
        isClickable = true;
      }
      break;
    case "label":
      if ((element as HTMLLabelElement).control) {
        let el2 = (element as HTMLLabelElement).control as HTMLElement, arr2: Hint[] = [];
        if (el2.getAttribute("disabled")) { return; }
        VHints.GetClickable_.call(arr2, el2);
        isClickable = arr2.length === 0;
      }
      break;
    case "button": case "select":
      isClickable = !(element as HTMLButtonElement | HTMLSelectElement).disabled || VHints.mode1_ > HintMode.LEAVE; break;
    case "object": case "embed":
      s = (element as HTMLObjectElement | HTMLEmbedElement).type;
      if (s && s.endsWith("x-shockwave-flash")) { isClickable = true; break; }
      if (element instanceof HTMLObjectElement && element.useMap) {
        VDom.getClientRectsForAreas_(element as HTMLObjectElement, this as Hint5[]);
      }
      return;
    case "img":
      if ((element as HTMLImageElement).useMap) {
        VDom.getClientRectsForAreas_(element as HTMLImageElement, this as Hint5[]);
      }
      if ((VHints.forHover_ && !(element.parentNode instanceof HTMLAnchorElement))
        || ((s = element.style.cursor as string) ? s !== "default"
          : (s = getComputedStyle(element).cursor as string) && (s.indexOf("zoom") >= 0 || s.startsWith("url"))
        )) {
        isClickable = true;
      }
      break;
    case "div": case "ul": case "pre": case "ol": case "code":
      type = (type = element.clientHeight) && type + 5 < element.scrollHeight ? ClickType.scrollY
        : (type = element.clientWidth) && type + 5 < element.scrollWidth ? ClickType.scrollX : ClickType.Default;
      break;
    }
    if (isClickable === null) {
      type = (s = element.contentEditable) !== "inherit" && s && s !== "false" ? ClickType.edit
        : (element.vimiumHasOnclick && VHints.isClickListened_) || element.getAttribute("onclick")
          || VHints.ngEnabled_ && element.getAttribute("ng-click")
          || (s = element.getAttribute("role")) && (s = s.toLowerCase()
            , s === "button" || s === "link" || s === "tab"
              || s === "checkbox" || s === "radio" || s.startsWith("menuitem"))
          || VHints.forHover_ && element.getAttribute("onmouseover")
          || (s = element.getAttribute("jsaction")) && VHints.checkJSAction_(s) ? ClickType.listener
        : (s = element.getAttribute("tabindex")) && parseInt(s, 10) >= 0 ? ClickType.tabindex
        : type > ClickType.tabindex ? type : (s = element.className) && VHints.btnRe_.test(s) ? ClickType.classname
        : ClickType.Default;
    }
    if (!isClickable && type === ClickType.Default) { return; }
    VHints.clicking_ = ClickingType.FindClickable;
    if (element === document.documentElement || element === document.body) { return; }
    if ((arr = VDom.getVisibleClientRect_(element))
        && (type < ClickType.scrollX || VScroller.shouldScroll_(element, type - ClickType.scrollX as 0 | 1))
        && ((s = element.getAttribute("aria-hidden")) == null || s && s.toLowerCase() !== "true")
        && ((s = element.getAttribute("aria-disabled")) == null || (s && s.toLowerCase() !== "true")
          || VHints.mode_ >= HintMode.min_job) // note: might need to apply aria-disable on FOCUS/HOVER/LEAVE mode?
    ) { this.push([element, arr, type]); }
  },
  noneActionRe_: <RegExpOne> /\._\b(?![\$\.])/,
  checkJSAction_ (str: string): boolean {
    for (let s of str.split(";")) {
      s = s.trim();
      const t = s.startsWith("click:") ? (s = s.substring(6)) : s && s.indexOf(":") === -1 ? s : null;
      if (t && t !== "none" && !this.noneActionRe_.test(t)) {
        return true;
      }
    }
    return false;
  },
  GetEditable_ (this: Hint[], element: Element): void {
    if (!(element instanceof HTMLElement) || element instanceof HTMLFormElement) { return; }
    let arr: VRect | null, type = ClickType.Default, s: string;
    switch (element.tagName.toLowerCase()) {
    case "input":
      if ((element as HTMLInputElement).type in VDom.uneditableInputs_) {
        return;
      } // no break;
    case "textarea":
      if ((element as HTMLInputElement | HTMLTextAreaElement).disabled ||
          (element as HTMLInputElement | HTMLTextAreaElement).readOnly) { return; }
      break;
    default:
      if ((s = element.contentEditable) === "inherit" || !s || s === "false") { return; }
      type = ClickType.edit;
      break;
    }
    if (arr = VDom.getVisibleClientRect_(element)) {
      this.push([element, arr, type]);
    }
  },
  GetLinks_ (this: Hint[], element: Element): void {
    let a: string | null, arr: VRect | null;
    if (element instanceof HTMLAnchorElement && ((a = element.getAttribute("href")) && a !== "#"
        && !VUtils.jsRe_.test(a)
        || element.hasAttribute("data-vim-url"))) {
      if (arr = VDom.getVisibleClientRect_(element)) {
        this.push([element, arr, ClickType.click]);
      }
    }
  },
  getImagesInImg_ (arr: Hint[], element: HTMLImageElement): void {
    if (!element.src && !element.getAttribute("data-src")) { return; }
    let rect: ClientRect | undefined, cr: VRect | null = null, w: number, h: number;
    if ((w = element.width) < 8 && (h = element.height) < 8) {
      if (w !== h || (w !== 0 && w !== 3)) { return; }
      rect = element.getClientRects()[0];
      if (rect) {
        w = rect.left; h = rect.top;
        cr = VDom.cropRectToVisible_(w, h, w + 8, h + 8);
      }
    } else if (rect = element.getClientRects()[0]) {
      w = rect.right + (rect.width < 3 ? 3 : 0);
      h = rect.bottom + (rect.height < 3 ? 3 : 0);
      cr = VDom.cropRectToVisible_(rect.left, rect.top, w, h);
    }
    if (cr && getComputedStyle(element).visibility === "visible") {
      arr.push([element, cr, ClickType.Default]);
    }
  },
  GetImages_ (this: Hint[], element: Element): void {
    if (element instanceof HTMLImageElement) { return VHints.getImagesInImg_(this, element); }
    if (!(element instanceof HTMLElement) || element instanceof HTMLFormElement) { return; }
    let str = element.getAttribute("data-src") || element.getAttribute("href"), cr: VRect | null;
    if (VUtils.isImageUrl_(str)) {
      if (cr = VDom.getVisibleClientRect_(element)) {
        this.push([element, cr, ClickType.Default]);
      }
    }
  },
  _shadowSign: "* /deep/ ",
  traverse_: function (this: {}, key: string
      , filter: HintsNS.Filter<Hint | Element>, notWantVUI?: boolean
      , root?: Document | Element): Hint[] | Element[] {
    if ((this as typeof VHints).ngEnabled_ === null && key === "*") {
      (this as typeof VHints).ngEnabled_ = document.querySelector('.ng-scope') != null;
    }
    let query: string = key, uiRoot = VDom.UI.box_ === VDom.UI.R || notWantVUI ? null : VDom.UI.R;
    if (VSettings.cache.deepHints) {
      query = (this as typeof VHints)._shadowSign + key;
      if (uiRoot && uiRoot.mode !== "closed") { uiRoot = null; }
    }
    const output: Hint[] | Element[] = [], isTag = query === "*" || (<RegExpOne>/^[a-z]+$/).test(query),
    Sc = VScroller,
    wantClickable = (filter as Function) === (this as typeof VHints).GetClickable_ && key === "*",
    box = root || document.webkitFullscreenElement || document;
    wantClickable && Sc.getScale_();
    (this as typeof VHints).clicking_ = wantClickable ? ClickingType.WantButNotFind : ClickingType.NotWantClickable;
    let list: HintsNS.ElementList | null = isTag ? box.getElementsByTagName(query) : box.querySelectorAll(query);
    if (!root && (this as typeof VHints).tooHigh_ && box === document && list.length >= 15000) {
      list = (this as typeof VHints).getElementsInViewPort_(list);
    }
    (output.forEach as HintsNS.ElementIterator<Hint | Element>).call(list, filter, output);
    if (root) { return output; }
    list = null;
    if (uiRoot) {
      const d = VDom, z = d.dbZoom_, bz = d.bZoom_, notHookScroll = Sc.scrolled_ === 0 && uiRoot !== d.UI.box_;
      if (bz !== 1 && box === document) {
        d.dbZoom_ = z / bz;
        d.prepareCrop_();
      }
      (output.forEach as HintsNS.ElementIterator<Hint | Element>).call((uiRoot as ShadowRoot).querySelectorAll(key), filter, output);
      d.dbZoom_ = z;
      if (notHookScroll) {
        Sc.scrolled_ = 0;
      }
    }
    Sc.scrolled_ === 1 && Sc.supressScroll_();
    if (wantClickable) { (this as typeof VHints).deduplicate_(output as Hint[]); }
    if ((this as typeof VHints).frameNested_ === null) {}
    else if (wantClickable) {
      (this as typeof VHints).checkNestedFrame_(output as Hint[]);
    } else if (output.length > 0) {
      (this as typeof VHints).frameNested_ = null;
    } else {
      (this as typeof VHints).checkNestedFrame_();
    }
    return output as Hint[];
  } as {
    (key: string, filter: HintsNS.Filter<HTMLElement>, notWantVUI?: true, root?: Document | Element): HTMLElement[];
    (key: string, filter: HintsNS.Filter<Hint>, notWantVUI?: boolean): Hint[];
  },
  getElementsInViewPort_ (list: HintsNS.ElementList): HintsNS.ElementList {
    const result: Element[] = [], height = window.innerHeight;
    for (let i = 1, len = list.length; i < len; i++) { // skip docEl
      const el = list[i];
      if (el instanceof HTMLFormElement) { continue; }
      const cr = el.getBoundingClientRect();
      if (cr.bottom > 0 && cr.top < height) {
        result.push(el);
        continue;
      }
      const last = el.lastElementChild;
      if (!last) { continue; }
      while (list[++i] !== last) {}
      i--;
    }
    return result.length > 12 ? result : list;
  },
  deduplicate_ (list: Hint[]): void {
    let j = list.length, i: number, k: ClickType;
    while (0 < --j) {
      if (list[i = j][2] !== ClickType.classname) {
      } else if ((k = list[--j][2]) > ClickType.frame || !this.isDescendant_(list[i][0], list[j][0])) {
        continue;
      } else if (VDom.isContaining_(list[j][1], list[i][1])) {
        list.splice(i, 1);
        continue;
      } else if (k < ClickType.listener || j === 0) {
        continue;
      }
      while (0 < j && (k = list[j - 1][2]) >= ClickType.listener && k <= ClickType.tabindex
          && this.isDescendant_(list[j][0], list[j - 1][0])) {
        j--;
        if (j === i - 3) { break; }
      }
      if (j < i) {
        list.splice(j, i - j);
      }
    }
  },
  isDescendant_ (d: Node, p: Element): boolean {
    let i = 3, c: EnsuredMountedElement | null | undefined, f: Node | null;
    for (; 0 < i-- && (c = d.parentNode as EnsuredMountedElement | null) !== p && c; d = c) {}
    if (c !== p) { return false; }
    for (; ; ) {
      if (c.childElementCount !== 1 || ((f = c.firstChild) instanceof Text && f.data.trim())) { return false; }
      if (i === 2) { break; }
      c = c.firstElementChild; i++;
    }
    return true;
  },
  frameNested_: false as HintsNS.NestedFrame,
  checkNestedFrame_: function(output?: Hint[]): void {
    const res = output && output.length > 1 ? null : window.frames && !(frames as Window[]).length ? false
      : document.webkitIsFullScreen ? 0 : this._getNestedFrame(output);
    this.frameNested_ = res === false && document.readyState === "complete" ? null : res;
  },
  _getNestedFrame (output?: Hint[]): HintsNS.NestedFrame {
    if (output == null) {
      if (!VDom.isHTML_()) { return false; }
      output = [];
      type Iter = HintsNS.ElementIterator<Hint>;
      (output.forEach as Function as Iter).call(document.querySelectorAll("a,button,input,frame,iframe"), this.GetClickable_, output);
    }
    if (output.length !== 1) {
      return output.length !== 0 && null;
    }
    let rect: ClientRect | undefined, rect2: ClientRect, element = output[0][0];
    if (
      ((element instanceof HTMLIFrameElement) || (element instanceof HTMLFrameElement))
        && (rect = element.getClientRects()[0])
        && (rect2 = (document.documentElement as HTMLHtmlElement).getBoundingClientRect())
        && rect.top - rect2.top < 20 && rect.left - rect2.left < 20
        && rect2.right - rect.right < 20 && rect2.bottom - rect.bottom < 20
        && getComputedStyle(element).visibility === 'visible'
    ) {
      return element;
    }
    return null;
  },
  getVisibleElements_ (view: ViewBox): Hint[] {
    let _i: number = this.mode1_;
    const isNormal = _i < HintMode.min_job, visibleElements = _i === HintMode.DOWNLOAD_IMAGE
        || _i === HintMode.OPEN_IMAGE ? this.traverse_("a[href],img[src],[data-src]", this.GetImages_, true)
      : _i >= HintMode.min_link_job && _i <= HintMode.max_link_job ? this.traverse_("a", this.GetLinks_)
      : this.traverse_("*", _i === HintMode.FOCUS_EDITABLE ? this.GetEditable_ : this.GetClickable_
          , _i === HintMode.FOCUS_EDITABLE);
    this.maxLeft_ = view[2], this.maxTop_ = view[3], this.maxRight_ = view[4];
    if (this.maxRight_ > 0) {
      _i = Math.ceil(Math.log(visibleElements.length) / Math.log(this.alphabetHints_.chars_.length));
      this.maxLeft_ -= 16 * _i + 12;
    }
    visibleElements.reverse();

    const obj = [null as never, null as never] as [VRect[], VRect], func = VDom.SubtractSequence_.bind(obj);
    let r2 = null as VRect[] | null, t: VRect, reason: ClickType, visibleElement: Hint;
    for (let _len = visibleElements.length, _j = Math.max(0, _len - 16); 0 < --_len; ) {
      _j > 0 && --_j;
      visibleElement = visibleElements[_len];
      if (visibleElement[2] > ClickType.maxNotBox) { continue; }
      let r = visibleElement[1];
      for (_i = _len; _j <= --_i; ) {
        t = visibleElements[_i][1];
        if (r[3] <= t[1] || r[2] <= t[0] || r[0] >= t[2] || r[1] >= t[3]) { continue; }
        if (visibleElements[_i][2] > ClickType.maxNotBox) { continue; }
        obj[0] = []; obj[1] = t;
        r2 !== null ? r2.forEach(func) : func(r);
        if ((r2 = obj[0]).length === 0) { break; }
      }
      if (r2 === null) { continue; }
      if (r2.length > 0) {
        t = r2[0];
        t[1] > this.maxTop_ && t[1] > r[1] || t[0] > this.maxLeft_ && t[0] > r[0] ||
          r2.length === 1 && (t[3] - t[1] < 3 || t[2] - t[0] < 3) || (visibleElement[1] = t);
      } else if ((reason = visibleElement[2]) === ClickType.classname
            || (reason === ClickType.listener ? isNormal : reason === ClickType.tabindex)
          && visibleElement[0].contains(visibleElements[_i][0])) {
        visibleElements.splice(_len, 1);
      } else {
        visibleElement.length > 3 && (r = (visibleElement as Hint4)[3][0]);
        for (let _k = _len; _i <= --_k; ) {
          t = visibleElements[_k][1];
          if (r[0] >= t[0] && r[1] >= t[1] && r[0] < t[0] + 10 && r[1] < t[1] + 8) {
            const offset: HintOffset = [r, visibleElement.length > 3 ? (visibleElement as Hint4)[3][1] + 13 : 13],
            hint2 = visibleElements[_k] as Hint4;
            hint2.length > 3 ? (hint2[3] = offset) : (hint2 as {} as HintOffset[]).push(offset);
            break;
          }
        }
      }
      r2 = null;
    }
    return visibleElements.reverse();
  },
  onKeydown_ (event: KeyboardEvent): HandlerResult {
    let linksMatched: HintsNS.LinksMatched, i: number;
    if (event.repeat || !this.isActive_) {
      // NOTE: should always prevent repeated keys.
    } else if (VKeyboard.isEscape_(event)) {
      this.clean_();
    } else if ((i = event.keyCode) === VKeyCodes.esc) {
      return HandlerResult.Suppress;
    } else if (i === VKeyCodes.ime) {
      VHints.clean_(true);
      VHUD.showForDuration("LinkHints exits because you're inputing");
      return HandlerResult.Nothing;
    } else if (i > VKeyCodes.f1 && i <= VKeyCodes.f12) {
      this.ResetMode_();
      if (i !== VKeyCodes.f2) { return HandlerResult.Nothing; }
      i = VKeyboard.getKeyStat_(event);
      const {cache} = VSettings, {deepHints} = cache;
      if (i === KeyStat.shiftKey) {
        this.isClickListened_ = !this.isClickListened_;
      } else if (i === KeyStat.plain) {
        cache.deepHints = !deepHints;
      } else if (i === KeyStat.ctrlKey || (i === VKeyCodes.metaKey && VSettings.cache.onMac)) {
        if (this.switchShadowVer_() && deepHints) {
          return HandlerResult.Prevent;
        }
        cache.deepHints = true;
      }
      setTimeout(this.reinit_.bind(this, null), 0);
    } else if (i === VKeyCodes.shiftKey || i === VKeyCodes.ctrlKey || i === VKeyCodes.altKey
        || (i === VKeyCodes.metaKey && VSettings.cache.onMac)) {
      const mode = this.mode_,
      mode2 = i === VKeyCodes.altKey
        ? mode < HintMode.min_disable_queue ? ((mode >= HintMode.min_job ? HintMode.empty : HintMode.newTab) | mode) ^ HintMode.queue : mode
        : mode < HintMode.min_job ? i === VKeyCodes.shiftKey ? (mode | HintMode.focused) ^ HintMode.mask_focus_new : (mode | HintMode.newTab) ^ HintMode.focused
        : mode;
      if (mode2 !== mode) {
        this.setMode_(mode2);
        i = VKeyboard.getKeyStat_(event);
        (i & (i - 1)) || (this.lastMode_ = mode);
      }
    } else if (i <= VKeyCodes.down && i >= VKeyCodes.pageup) {
      VEventMode.scroll_(event);
      this.ResetMode_();
    } else if (i === VKeyCodes.space) {
      this.zIndexes_ === false || this.rotateHints_(event.shiftKey);
      event.shiftKey && this.ResetMode_();
    } else if (!(linksMatched = this.alphabetHints_.matchHintsByKey_(this.hints_ as HintsNS.HintItem[], event, this.keyStatus_))){
      if (linksMatched === false) {
        this.tooHigh_ = null;
        setTimeout(this.reinit_.bind(this, null), 0);
      }
    } else if (linksMatched.length === 0) {
      this.deactivate_(this.keyStatus_.known);
    } else if (linksMatched.length === 1) {
      VUtils.prevent_(event);
      this.activateLink_(linksMatched[0]);
    } else {
      const limit = this.keyStatus_.tab ? 0 : this.keyStatus_.newHintLength;
      for (i = linksMatched.length; 0 <= --i; ) {
        let ref = linksMatched[i].marker.childNodes as NodeListOf<HTMLSpanElement>, j = ref.length;
        while (limit <= --j) {
          ref[j].classList.remove("MC");
        }
        for (; 0 <= j; --j) {
          ref[j].classList.add("MC");
        }
      }
    }
    return HandlerResult.Prevent;
  },
  switchShadowVer_(): boolean { // return true if fail
    let v1 = "* >>> ", v0 = "* /deep/ ", sign = v0;
    if (VSettings.cache.browserVer < BrowserVer.MinSelector$GtGtGt$IfFlag$ExperimentalWebPlatformFeatures$Enabled) {
    } else try {
      (VDom.UI.box_ || VDom.createElement_('div')).querySelector(v1 + "div");
      sign = v1;
    } catch (e) {
    }
    this.switchShadowVer_ = function(): boolean {
      this._shadowSign = this._shadowSign !== sign ? sign : v0;
      return sign === v0;
    }
    return this.switchShadowVer_();
  },
  ResetMode_ (): void {
    if (VHints.mode_ >= HintMode.min_disable_queue || VHints.lastMode_ === VHints.mode_) { return; }
    const d = VEventMode.keydownEvents();
    if (d[VKeyCodes.ctrlKey] || d[VKeyCodes.metaKey] || d[VKeyCodes.shiftKey] || d[VKeyCodes.altKey]) {
      return VHints.setMode_(VHints.lastMode_);
    }
  },
  resetHints_ (): void {
    let ref = this.hints_, i = 0, len = ref ? ref.length : 0;
    this.hints_ = this.zIndexes_ = null;
    this.pTimer_ > 0 && clearTimeout(this.pTimer_);
    while (i < len) { (ref as HintsNS.HintItem[])[i++].target = null as never; }
  },
  activateLink_ (hint: HintsNS.HintItem): void {
    let rect: VRect | null | undefined, clickEl: HintsNS.LinkEl | null = hint.target;
    this.resetHints_();
    const str = (this.modeOpt_ as HintsNS.ModeOpt)[this.mode_] as string;
    VHUD.text_ = str; // in case pTimer > 0
    if (VDom.isInDOM_(clickEl)) {
      // must get outline first, because clickEl may hide itself when activated
      // must use UI.getVRect, so that VDom.zooms are updated, and prepareCrop is called
      rect = VDom.UI.getVRect_(clickEl, hint.refer !== hint.target ? hint.refer as HTMLElementUsingMap | null : null);
      const showRect = (this.modeOpt_ as HintsNS.ModeOpt).activator_.call(this, clickEl, rect, hint);
      if (showRect !== false && (rect || (rect = VDom.getVisibleClientRect_(clickEl)))) {
        const force = clickEl instanceof HTMLIFrameElement || clickEl instanceof HTMLFrameElement;
        setTimeout(function(): void {
          (force || document.hasFocus()) && VDom.UI.flash_(null, rect as VRect);
        }, 17);
      }
    } else {
      clickEl = null;
      VHUD.showForDuration("The link has been removed from page", 2000);
    }
    this.pTimer_ = -(VHUD.text_ !== str);
    if (!(this.mode_ & HintMode.queue)) {
      this.setupCheck_(clickEl, null);
      return this.deactivate_(true);
    }
    this.isActive_ = false;
    this.setupCheck_();
    setTimeout(function(): void {
      const _this = VHints;
      _this.reinit_(clickEl, rect);
      if (1 === --_this.count_ && _this.isActive_) {
        return _this.setMode_(_this.mode1_);
      }
    }, 18);
  },
  reinit_ (lastEl?: HintsNS.LinkEl | null, rect?: VRect | null): void {
    if (!VSettings.enabled_) { return this.clean_(); }
    this.isActive_ = false;
    this.keyStatus_.tab = 0;
    this.zIndexes_ = null;
    this.resetHints_();
    const isClick = this.mode_ < HintMode.min_job;
    this.activate(0, this.options_);
    return this.setupCheck_(lastEl, rect, isClick);
  },
  setupCheck_ (el?: HintsNS.LinkEl | null, r?: VRect | null, isClick?: boolean): void {
    this.timer_ && clearTimeout(this.timer_);
    this.timer_ = el && (isClick === true || this.mode_ < HintMode.min_job) ? setTimeout(function(i): void {
      !i && VHints && VHints.CheckLast_(el, r);
    }, 255) : 0;
  },
  CheckLast_ (this: void, el: HintsNS.LinkEl, r?: VRect | null): void {
    const _this = VHints;
    if (!_this) { return; }
    _this.timer_ = 0;
    const r2 = el.getBoundingClientRect(), hidden = r2.width < 1 && r2.height < 1 || getComputedStyle(el).visibility !== "visible";
    if (hidden && VDom.lastHovered_ === el) {
      VDom.lastHovered_ = null;
    }
    if (r && _this.isActive_ && (_this.hints_ as HintsNS.HintItem[]).length < 64
        && !_this.alphabetHints_.hintKeystroke_
        && (hidden || Math.abs(r2.left - r[0]) > 100 || Math.abs(r2.top - r[1]) > 60)) {
      return _this.reinit_();
    }
  },
  clean_ (keepHUD?: boolean): void {
    const ks = this.keyStatus_, alpha = this.alphabetHints_;
    this.options_ = this.modeOpt_ = this.zIndexes_ = this.hints_ = null as never;
    this.pTimer_ > 0 && clearTimeout(this.pTimer_);
    this.lastMode_ = this.mode_ = this.mode1_ = this.count_ = this.pTimer_ =
    this.maxLeft_ = this.maxTop_ = this.maxRight_ = ks.tab = ks.newHintLength = alpha.countMax_ = 0;
    alpha.hintKeystroke_ = alpha.chars_ = "";
    this.isActive_ = this.noHUD_ = this.tooHigh_ = ks.known = false;
    VUtils.remove_(this);
    VEventMode.onWndBlur_(null);
    if (this.box_) {
      this.box_.remove();
      this.box_ = null;
    }
    keepHUD || VHUD.hide_();
  },
  deactivate_ (onlySuppressRepeated: boolean): void {
    this.clean_(this.pTimer_ < 0);
    return VDom.UI.suppressTail_(onlySuppressRepeated);
  },
  rotateHints_ (reverse?: boolean): void {
    let ref = this.hints_ as HintsNS.HintItem[], stacks = this.zIndexes_;
    if (!stacks) {
      stacks = [] as HintsNS.Stacks;
      ref.forEach(this.MakeStacks_, [[], stacks] as [Array<ClientRect | null>, HintsNS.Stacks]);
      stacks = stacks.filter(stack => stack.length > 1);
      if (stacks.length <= 0) {
        this.zIndexes_ = this.keyStatus_.newHintLength <= 0 ? false : null;
        return;
      }
      this.zIndexes_ = stacks;
    }
    for (const stack of stacks) {
      reverse && stack.reverse();
      const i = stack[stack.length - 1];
      let oldI = ref[i].zIndex || i;
      for (const j of stack) {
        const hint = ref[j], {style} = hint.marker, newI = hint.zIndex || j;
        style.zIndex = (hint.zIndex = oldI) as number | string as string;
        oldI = newI;
      }
      reverse && stack.reverse();
    }
  },
  MakeStacks_ (this: [Array<ClientRect | null>, HintsNS.Stacks], hint: HintsNS.HintItem, i: number) {
    let rects = this[0];
    if (hint.marker.style.visibility === "hidden") { rects.push(null); return; }
    const stacks = this[1], m = hint.marker.getClientRects()[0];
    rects.push(m);
    let stackForThisMarker = null as HintsNS.Stack | null;
    for (let j = 0, len2 = stacks.length; j < len2; ) {
      let stack = stacks[j], k = 0, len3 = stack.length;
      for (; k < len3; k++) {
        const t = rects[stack[k]] as ClientRect;
        if (m.bottom > t.top && m.top < t.bottom && m.right > t.left && m.left < t.right) {
          break;
        }
      }
      if (k >= len3) {}
      else if (stackForThisMarker) {
        stackForThisMarker.push(...stack);
        stacks.splice(j, 1); len2--;
        continue;
      } else {
        stack.push(i);
        stackForThisMarker = stack;
      }
      j++;
    }
    stackForThisMarker || stacks.push([i]);
  },

alphabetHints_: {
  chars_: "",
  hintKeystroke_: "",
  countMax_: 0,
  countLimit_: 0,
  numberToHintString_ (number: number): string {
    const characterSet = this.chars_, base = characterSet.length;
    let hintString = "";
    do {
      let remainder = number % base;
      number = (number / base) | 0;
      hintString = characterSet[remainder] + hintString;
    } while (number > 0);
    number = this.countMax_ - hintString.length - +(number < this.countLimit_);
    if (number > 0) {
      hintString = this.repeat_(characterSet[0], number) + hintString;
    }
    return hintString;
  },
  initMarkers_ (hintItems: HintsNS.HintItem[]): void {
    this.hintKeystroke_ = "";
    for (let end = hintItems.length, hints = this.buildHintIndexes_(end), h = 0; h < end; h++) {
      const hint = hintItems[h], hintString = hint.key = this.numberToHintString_(hints[h]);
      for (let i = 0, len = hintString.length; i < len; i++) {
        const node = document.createElement('span');
        node.textContent = hintString[i];
        hint.marker.appendChild(node);
      }
    }
    this.countMax_ -= (this.countLimit_ > 0) as boolean | number as number;
    this.countLimit_ = 0;
  },
  buildHintIndexes_ (linkCount: number): number[] {
    const hints: number[] = [], result: number[] = [], len = this.chars_.length, count = linkCount, start = count % len;
    let i = this.countMax_ = Math.ceil(Math.log(count) / Math.log(len)), max = count - start + len
      , end = this.countLimit_ = ((Math.pow(len, i) - count) / (len - 1)) | 0;
    for (i = 0; i < end; i++) {
      hints.push(i);
    }
    for (end *= len - 1; i < count; i++) {
      hints.push(i + end);
    }
    for (i = 0; i < len; i++) {
      if (i === start) { max -= len; }
      for (let j = i; j < max; j += len) {
        result.push(hints[j]);
      }
    }
    return result;
  },
  matchHintsByKey_ (hints: HintsNS.HintItem[], event: KeyboardEvent, keyStatus: HintsNS.KeyStatus): HintsNS.LinksMatched {
    let keyChar: string, key = event.keyCode, arr = null as HintsNS.HintItem[] | null;
    if (key === VKeyCodes.tab) {
      if (!this.hintKeystroke_) {
        return false;
      }
      keyStatus.tab = (1 - keyStatus.tab) as BOOL;
    } else if (keyStatus.tab) {
      this.hintKeystroke_ = "";
      keyStatus.tab = 0;
    }
    keyStatus.known = true;
    if (key === VKeyCodes.tab) {}
    else if (key === VKeyCodes.backspace || key === VKeyCodes.deleteKey || key === VKeyCodes.f1) {
      if (!this.hintKeystroke_) {
        return [];
      }
      this.hintKeystroke_ = this.hintKeystroke_.slice(0, -1);
    } else if ((keyChar = VKeyboard.char(event).toUpperCase()) && keyChar.length === 1) {
      if (this.chars_.indexOf(keyChar) === -1) {
        return [];
      }
      this.hintKeystroke_ += keyChar;
      arr = [];
    } else {
      return null;
    }
    keyChar = this.hintKeystroke_;
    keyStatus.newHintLength = keyChar.length;
    keyStatus.known = false;
    VHints.zIndexes_ && (VHints.zIndexes_ = null);
    const wanted = !keyStatus.tab;
    if (arr !== null && keyChar.length >= this.countMax_) {
      hints.some(function(hint): boolean {
        return hint.key === keyChar && ((arr as HintsNS.HintItem[]).push(hint), true);
      });
      if (arr.length === 1) { return arr; }
    }
    return hints.filter(function(hint) {
      const pass = (hint.key as string).startsWith(keyChar) === wanted;
      hint.marker.style.visibility = pass ? "" : "hidden";
      return pass;
    });
  },
  repeat_ (this: void, s: string, n: number): string {
    if (s.repeat) { return s.repeat(n); }
    for (var s2 = s; --n; ) { s2 += s; }
    return s2;
  }
},

getUrlData_ (link: HTMLAnchorElement): string {
  const str = link.getAttribute("data-vim-url");
  if (str) {
    link = VDom.createElement_("a");
    link.href = str.trim();
  }
  return link.href;
},
getImageUrl_ (img: HTMLElement): string | void {
  let isImg = img instanceof HTMLImageElement
    , text: string = isImg ? (img as HTMLImageElement).src : img instanceof HTMLAnchorElement ? img.href : ""
    , src = img.getAttribute("data-src") || "";
  if (!text || text.startsWith("data:") || VUtils.jsRe_.test(text)
      || src.length > text.length + 7 && (isImg || VUtils.isImageUrl_(src))) {
    text = src;
  }
  return text || VHUD.showForDuration("Not an image", 1000);
},

openUrl_ (url: string, incognito?: boolean): void {
  let kw = this.options_.keyword, opt: Req.fg<"openUrl"> = {
    handler: "openUrl",
    reuse: this.mode_ & HintMode.queue ? ReuseType.newBg : ReuseType.newFg,
    url,
    keyword: kw != null ? kw + "" : ""
  };
  incognito && (opt.incognito = incognito);
  VPort.post(opt);
},
highlightChild_ (el: HTMLIFrameElement | HTMLFrameElement): false | void {
  interface VWindow extends Window {
    VEventMode: VEventMode;
    VHints: typeof VHints;
  }
  let err: boolean | null = true, child: VWindow = null as never;
  try {
    err = !el.contentDocument ||
      (child = el.contentWindow as VWindow).VEventMode.keydownEvents(VEventMode.keydownEvents());
  } catch (e) {}
  const { count_: count, options_: options } = this;
  options.mode = this.mode_;
  el.focus();
  if (err) {
    VPort.send_({ msg: "execInChild", url: el.src, CSS: "1",
      command: "focusAndHint", count, options
    }, function(res): void {
      if (!res) {
        el.contentWindow.focus();
      }
    });
    return;
  }
  child.VHints.ActivateAndFocus_(count, options);
  return false;
},

Modes_: {
HOVER_: {
  128: "Hover over node",
  192: "Hover over nodes continuously",
  activator_ (element, rect): void {
    const type = VDom.getEditableType_(element);
    VScroller.current_ = element;
    VDom.hover_(element, rect);
    type || element.tabIndex < 0 || element instanceof HTMLIFrameElement ||
      element instanceof HTMLFrameElement || element.focus();
    if ((this as typeof VHints).mode_ < HintMode.min_job) {
      return VHUD.showForDuration("Hover for scrolling", 1000);
    }
  }
} as HintsNS.ModeOpt,
LEAVE_: {
  129: "Simulate mouse leaving link",
  193: "Simulate mouse leaving continuously",
  activator_ (this: void, element): void {
    const same = VDom.lastHovered_ === element;
    VDom.hover_(null);
    same || VDom.mouse_(element, "mouseout");
    if (document.activeElement === element) { element.blur(); }
  }
} as HintsNS.ModeOpt,
COPY_TEXT_: {
  130: "Copy link text to Clipboard",
  131: "Search selected text",
  137: "Copy link URL to Clipboard",
  194: "Copy link text one by one",
  195: "Search link text one by one",
  201: "Copy link URL one by one",
  256: "Edit link URL on Vomnibar",
  257: "Edit link text on Vomnibar",
  activator_ (link): void {
    let isUrl = (this as typeof VHints).mode1_ >= HintMode.min_link_job && (this as typeof VHints).mode1_ <= HintMode.max_link_job, str: string | null;
    if (isUrl) {
      str = (this as typeof VHints).getUrlData_(link as HTMLAnchorElement);
      str && str.startsWith("mailto:") && str.length > 7 && (str = str.substring(7).trimLeft());
    }
    else if ((str = link.getAttribute("data-vim-text")) && (str = str.trim())) {}
    else if (link instanceof HTMLInputElement) {
      str = link.type;
      if (str === "password") {
        return VHUD.showForDuration("Sorry, Vimium C won't copy a password.", 2000);
      } else if (!(str in VDom.uneditableInputs_)) {
        str = (link.value || link.placeholder).trim();
      } else if (str === "file") {
        str = link.files && link.files.length > 0 ? link.files[0].name : "";
      } else if ("button image submit reset".indexOf(str) >= 0) {
        str = link.value.trim() || link.title.trim();
      } else {
        str = link.title.trim(); // including `[type="image"]`
      }
    } else {
      str = link instanceof HTMLTextAreaElement ? link.value
        : link instanceof HTMLSelectElement ? (link.selectedIndex < 0 ? "" : link.options[link.selectedIndex].text)
        : link instanceof HTMLElement && (str = link.innerText.trim(),
            str.startsWith("mailto:") && str.length > 7 ? str.substring(7).trimLeft() : str)
          || (str = link.textContent.trim()) && str.replace(<RegExpG> /\s+/g, " ")
        ;
      str = str.trim() || (link instanceof HTMLElement ? link.title.trim() : "");
    }
    if (!str) {
      return VHUD.showCopied("", isUrl ? "url" : "");
    }
    if ((this as typeof VHints).mode_ >= HintMode.min_edit && (this as typeof VHints).mode_ <= HintMode.max_edit) {
      const force = (this as typeof VHints).options_.force;
      (VPort as ComplicatedVPort).post<"vomnibar", { count: number } & Partial<VomnibarNS.ContentOptions>>({
        handler: "vomnibar",
        count: 1,
        force: force != null ? !!force : !isUrl,
        url: str,
        keyword: ((this as typeof VHints).options_.keyword || "") + ""
      });
      return;
    } else if ((this as typeof VHints).mode1_ === HintMode.SEARCH_TEXT) {
      (this as typeof VHints).openUrl_(str);
      return;
    }
    // NOTE: url should not be modified
    // although BackendUtils.convertToUrl does replace '\u3000' with ' '
    str = isUrl ? VUtils.decodeURL_(str) : str;
    VPort.post({
      handler: "copy",
      data: str
    });
    VHUD.showCopied(str);
  }
} as HintsNS.ModeOpt,
OPEN_INCOGNITO_LINK_: {
  138: "Open link in incognito window",
  202: "Open multi incognito tabs",
  activator_ (link: HTMLAnchorElement): void {
    const url = (this as typeof VHints).getUrlData_(link);
    if (!VPort.evalIfOK_(url)) {
      return (this as typeof VHints).openUrl_(url, true);
    }
  }
} as HintsNS.ModeOpt,
DOWNLOAD_IMAGE_: {
  132: "Download image",
  196: "Download multiple images",
  activator_ (img: HTMLElement): void {
    let text = (this as typeof VHints).getImageUrl_(img);
    if (!text) { return; }
    const i = text.indexOf("://"), a = VDom.createElement_("a");
    if (i > 0) {
      text = text.substring(text.indexOf('/', i + 4) + 1);
    }
    if (text.length > 40) {
      text = text.substring(0, 39) + "\u2026";
    }
    a.href = (img as HTMLImageElement).src;
    a.download = img.getAttribute("download") || "";
    VDom.mouse_(a, "click", null);
    return VHUD.showForDuration("Download: " + text, 2000);
  }
} as HintsNS.ModeOpt,
OPEN_IMAGE_: {
  133: "Open image",
  197: "Open multiple image",
  activator_ (img: HTMLElement): void {
    let text = (this as typeof VHints).getImageUrl_(img), url: string, str: string | null;
    if (!text) { return; }
    url = "vimium://show image ";
    if (str = img.getAttribute("download")) {
      url += "download=" + encodeURIComponent(str) + "&";
    }
    (this as typeof VHints).openUrl_(url + text);
  }
} as HintsNS.ModeOpt,
DOWNLOAD_LINK_: {
  136: "Download link",
  200: "Download multiple links",
  activator_ (this: void, link: HTMLAnchorElement, rect): void {
    let oldDownload: string | null, oldUrl: string | null, changed = false;
    oldUrl = link.getAttribute("href");
    if (!oldUrl || oldUrl === "#") {
      oldDownload = link.getAttribute("data-vim-url");
      if (oldDownload && (oldDownload = oldDownload.trim())) {
        link.href = oldDownload;
        changed = true;
      }
    }
    oldDownload = link.getAttribute("download");
    if (oldDownload == null) {
      link.download = "";
    }
    VDom.UI.click_(link, rect, {
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false
    });
    if (oldDownload === null) {
      link.removeAttribute("download");
    }
    if (!changed) {}
    else if (typeof oldUrl === "string") {
      link.setAttribute("href", oldUrl);
    } else if (oldUrl === null) {
      link.removeAttribute("href");
    }
  }
} as HintsNS.ModeOpt,
FOCUS_EDITABLE_: {
  134: "Focus node",
  198: "Focus nodes continuously",
  258: "Select an editable area",
  activator_ (link, rect): void | false {
    if ((this as typeof VHints).mode_ < HintMode.min_disable_queue) {
      VDom.view(link);
      link.focus();
      VDom.UI.flash_(link);
    } else {
      VDom.UI.simulateSelect_(link, rect, true);
    }
    return false;
  }
} as HintsNS.ModeOpt,
DEFAULT_: {
  0: "Open link in current tab",
  2: "Open link in new tab",
  3: "Open link in new active tab",
  64: "Open multiple links in current tab",
  66: "Open multiple links in new tabs",
  67: "Activate link and hold on",
  activator_ (link, rect, hint): void | false {
    if (link instanceof HTMLIFrameElement || link instanceof HTMLFrameElement) {
      const ret = link === Vomnibar.box_ ? (Vomnibar.focus_(), false)
        : (this as typeof VHints).highlightChild_(link);
      (this as typeof VHints).mode_ = HintMode.DEFAULT;
      return ret;
    } else if (typeof HTMLDetailsElement === "function" ? link instanceof HTMLDetailsElement : link.tagName.toLowerCase() === "details") {
      let old = (link as HTMLDetailsElement).open;
      // although it does not work on Chrome 65 yet
      VDom.UI.click_(link, rect, null, true);
      ((link as HTMLDetailsElement).open === old) && ((link as HTMLDetailsElement).open = !old);
      return;
    } else if (hint.refer && hint.refer === hint.target) {
      return (this as typeof VHints).Modes_.HOVER_.activator_.call(this, link, rect, hint);
    } else if (VDom.getEditableType_(link) >= EditableType.Editbox) {
      VDom.UI.simulateSelect_(link, rect, true);
      return false;
    }
    const mode = (this as typeof VHints).mode_ & HintMode.mask_focus_new, onMac = VSettings.cache.onMac, newTab = mode >= HintMode.newTab;
    VDom.UI.click_(link, rect, {
      altKey: false,
      ctrlKey: newTab && !onMac,
      metaKey: newTab &&  onMac,
      shiftKey: mode === HintMode.OPEN_IN_NEW_FG_TAB
    }, mode !== HintMode.empty || link.tabIndex >= 0);
  }
} as HintsNS.ModeOpt
}
};
