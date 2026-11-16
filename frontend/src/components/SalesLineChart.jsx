import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import "./SalesLineChart.css";

function formatDate(value) {
  if (!value) return "";
  // SalesPage supplies YYYY-MM-DD in Asia/Kolkata business time. Parse as UTC
  // to prevent a browser timezone offset from shifting the displayed day.
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function formatCurrency(value) {
  return `₹${Number(
    value || 0
  ).toLocaleString("en-IN")}`;
}

function SalesLineChart({
  data = [],
  loading = false,
}) {
  if (loading) {
    return (
      <div className="sales-chart-empty">
        Loading rental sales graph...
      </div>
    );
  }

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="sales-chart-empty">
        No rental sales data available yet.
      </div>
    );
  }

  const chartData = data.map((item) => ({
    label: formatDate(item.date),
    sales: Number(item.sales ?? item.amount ?? item.totalAmount ?? 0),
  }));

  return (
    <div className="sales-line-chart">
      <ResponsiveContainer
        width="100%"
        height={320}
      >
        <LineChart
          data={chartData}
          margin={{
            top: 20,
            right: 20,
            left: 10,
            bottom: 5,
          }}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            stroke="#e6e0d5"
          />

          <XAxis
            dataKey="label"
            stroke="#716b61"
          />

          <YAxis
            stroke="#716b61"
            tickFormatter={formatCurrency}
          />

          <Tooltip
            formatter={(value) =>
              formatCurrency(value)
            }
            labelFormatter={(label) =>
              `Date: ${label}`
            }
          />

          <Line
            type="monotone"
            dataKey="sales"
            stroke="#b9822b"
            strokeWidth={3}
            dot={{
              r: 4,
              fill: "#b9822b",
            }}
            activeDot={{
              r: 7,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SalesLineChart;
