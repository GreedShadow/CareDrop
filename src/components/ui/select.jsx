export function Select({ value, onValueChange, children }) {
  const items = [];

  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === SelectContent) {
      walk(node.props.children);
      return;
    }
    if (node.type === SelectItem) {
      items.push({ value: node.props.value, label: node.props.children });
      return;
    }
    if (node.props?.children) {
      walk(node.props.children);
    }
  };

  walk(children);

  return (
    <select
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

export function SelectTrigger() {
  return null;
}

export function SelectValue() {
  return null;
}

export function SelectContent({ children }) {
  return children;
}

export function SelectItem() {
  return null;
}
