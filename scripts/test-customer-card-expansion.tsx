import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { CustomerCardBoundary } from '../components/customer-card-render-boundary';
import { createCustomerCardExpansionStore } from '../src/lib/customer-card-expansion';

// An external dev-only renderer can be supplied without adding native dependencies.
// It must use this project's React instance.
const require = createRequire(import.meta.url);
const { act, create } = require(process.env.CUSTOMER_CARD_TEST_RENDERER || 'react-test-renderer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function main() {
  const expansion = createCustomerCardExpansionStore();
  const items = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), name: `Cliente ${i}` }));
  let renderCount = 0;
  const renderCard = (item: typeof items[number], expanded: boolean, toggle: () => void) => {
    renderCount++;
    return <button onClick={toggle} data-expanded={expanded}>{item.name}</button>;
  };
  const list = (rows = items, store = expansion, render = renderCard) => (
    <>{rows.map(item => <CustomerCardBoundary key={item.id} item={item} expansion={store} renderCard={render} />)}</>
  );
  let tree: any;
  await act(() => { tree = create(list()); });
  assert.equal(renderCount, 1000);
  renderCount = 0;
  await act(() => tree.root.findAllByType('button')[5].props.onClick());
  assert.equal(renderCount, 1, 'Opening one customer must render only that customer');
  assert.equal(expansion.isExpanded('5'), true);
  renderCount = 0;
  await act(() => expansion.toggle('8'));
  assert.equal(renderCount, 1);
  assert.equal(expansion.isExpanded('5'), true, 'Opening another card must preserve the first');
  await act(() => expansion.toggle('8'));
  assert.equal(expansion.isExpanded('8'), false);
  renderCount = 0;
  await act(() => tree.update(list()));
  assert.equal(renderCount, 0, 'Unchanged parent renders must not rebuild cards');
  const updated = items.map(item => item.id === '5' ? { ...item, name: 'Nome aggiornato dal server' } : item);
  await act(() => tree.update(list(updated)));
  assert.equal(renderCount, 1, 'A changed customer must receive fresh server data');
  assert.equal(tree.root.findAllByType('button')[5].children[0], 'Nome aggiornato dal server');
  await act(() => tree.update(list([])));
  await act(() => tree.update(list(updated)));
  assert.equal(tree.root.findAllByType('button')[5].props['data-expanded'], true, 'Filtering must preserve expansion');
  renderCount = 0;
  const freshRender = (item: typeof items[number], expanded: boolean, toggle: () => void) => renderCard(item, expanded, toggle);
  await act(() => tree.update(list(updated, expansion, freshRender)));
  assert.equal(renderCount, 1000, 'Changed contextual data must propagate to all cards');
  await act(() => tree.update(list(items, createCustomerCardExpansionStore())));
  assert.equal(tree.root.findAllByType('button')[5].props['data-expanded'], false, 'A different workspace must start clean');
  await act(() => tree.unmount());
  renderCount = 0;
  expansion.toggle('5');
  assert.equal(renderCount, 0, 'Unmounted cards must unsubscribe');
  console.log('PASS: 1000 customer cards; one toggle renders one card; updates, filtering, multiple expansions and workspace isolation verified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
