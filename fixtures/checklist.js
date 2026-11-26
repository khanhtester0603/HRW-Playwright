function checklist(...steps) {
  return steps.map(description => ({ type: 'checklist-step', description }));
}

module.exports = { checklist };
