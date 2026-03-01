import { useState, useCallback } from "react";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"];

function ColorSwatch({ color, onClick }) {
  return (
    <div
      onClick={() => onClick(color)}
      className="w-12 h-12 rounded-xl cursor-pointer transition-transform hover:scale-110 active:scale-95"
      style={{ backgroundColor: color }}
    />
  );
}

function Counter({ value, onIncrement, onDecrement, onReset }) {
  return (
    <div className="flex flex-col items-center gap-4 p-6 border border-gray-200 rounded-2xl">
      <span className="text-5xl font-bold tabular-nums">{value}</span>
      <div className="flex gap-2">
        <button
          onClick={onDecrement}
          className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          −
        </button>
        <button
          onClick={onIncrement}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          +
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm text-gray-500"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [count, setCount] = useState(0);
  const [selectedColor, setSelectedColor] = useState(COLORS[4]);

  const increment = useCallback(() => setCount((c) => c + 1), []);
  const decrement = useCallback(() => setCount((c) => c - 1), []);
  const reset = useCallback(() => setCount(0), []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8 bg-white">
      <h1 className="text-3xl font-bold">JSX Sample</h1>

      <Counter
        value={count}
        onIncrement={increment}
        onDecrement={decrement}
        onReset={reset}
      />

      <div className="flex flex-col items-center gap-3 p-6 border border-gray-200 rounded-2xl">
        <p className="text-sm text-gray-500">Selected color</p>
        <div
          className="w-16 h-16 rounded-2xl shadow-md transition-colors duration-300"
          style={{ backgroundColor: selectedColor }}
        />
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <ColorSwatch key={c} color={c} onClick={setSelectedColor} />
          ))}
        </div>
      </div>
    </div>
  );
}
