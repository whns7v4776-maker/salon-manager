// Paste this local, self-cleaning fixture into the Safari console on localhost.
// No network, app handlers, credentials, storage or application state are used.
(() => {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;height:400px;pointer-events:none';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const rules = [];
  const walk = list => { for (const rule of list) { if (rule.style?.getPropertyValue('cursor')) rules.push(rule.cssText); if (rule.cssRules) walk(rule.cssRules); } };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch { /* Third-party sheet is not part of this fixture. */ } }
  const style = doc.createElement('style');
  const errors = [];
  let checks = 0;
  const cursor = node => frame.contentWindow.getComputedStyle(node).cursor;
  const expect = (name, node, expected) => { checks++; const actual = cursor(node); if (actual !== expected) errors.push({ name, expected, actual }); };
  const make = html => { const host = doc.createElement('div'); host.innerHTML = html; doc.body.appendChild(host); return host.firstElementChild; };
  try {
    const button = make('<button><span style="cursor:default">Action</span></button>');
    const before = cursor(button.firstElementChild);
    style.textContent = rules.join('\n'); doc.head.appendChild(style);
    expect('button text overrides default', button.firstElementChild, 'pointer');
    const after = cursor(button.firstElementChild);
    for (const role of ['button','link','tab','radio','checkbox','switch','menuitem','option']) {
      const action = make(`<div role="${role}"><span style="cursor:auto">Label</span></div>`);
      expect(`${role} label`, action.firstElementChild, 'pointer');
      action.setAttribute('aria-disabled','true'); expect(`${role} disabled`, action, 'not-allowed');
      action.removeAttribute('aria-disabled'); expect(`${role} re-enabled`, action.firstElementChild, 'pointer');
    }
    const legacy = make('<div tabindex="0"><span style="cursor:default">Unlabelled touchable</span></div>');
    expect('roleless RNW touchable text', legacy.firstElementChild, 'pointer');
    const custom = make('<div data-web-clickable="true" style="cursor:default"><span style="cursor:default">Legacy action</span></div>');
    expect('shared touchable', custom, 'pointer'); expect('shared touchable text', custom.firstElementChild, 'pointer');
    const mixed = make('<div role="button"><input style="cursor:text"><div contenteditable="true" style="cursor:text"><span>Editor</span></div><div role="slider" style="cursor:ew-resize"><span>Slider</span></div><div role="scrollbar" style="cursor:grab"><span>Scroll</span></div><svg style="cursor:default"><path style="cursor:auto"></path></svg></div>');
    expect('input caret', mixed.children[0], 'text'); expect('editable caret', mixed.children[1].firstElementChild, 'text');
    expect('slider', mixed.children[2].firstElementChild, 'ew-resize'); expect('scrollbar', mixed.children[3].firstElementChild, 'grab');
    expect('icon path', mixed.querySelector('path'), 'pointer');
    const drag = make('<div role="button" data-salon-cursor="grab"><span style="cursor:default">Drag</span><div data-salon-cursor="resize-y"><span style="cursor:default">Resize</span></div></div>');
    expect('agenda drag', drag.firstElementChild, 'grab'); expect('agenda resize inside drag', drag.lastElementChild.firstElementChild, 'ns-resize');
    doc.documentElement.setAttribute('data-salon-agenda-cursor','grabbing'); expect('live drag lock', button.firstElementChild, 'grabbing');
    doc.documentElement.setAttribute('data-salon-agenda-cursor','resize-y'); expect('live resize lock', button.firstElementChild, 'ns-resize');
    doc.documentElement.removeAttribute('data-salon-agenda-cursor'); expect('released lock', button.firstElementChild, 'pointer');
    for (let index = 0; index < 12; index++) { custom.innerHTML = '<span style="cursor:default">Remounted text</span>'; expect('remount '+index, custom.firstElementChild, 'pointer'); }
    return JSON.stringify({ checks, cursorRules: rules.length, before, after, errors });
  } finally { frame.remove(); }
})()
