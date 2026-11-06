import { Card } from "../common/Card";
import { KpiCard } from "../dashboard/KpiCard";
import { StatusBanner } from "../dashboard/StatusBanner";
import { AlertQueueList } from "../dashboard/AlertQueueList";

// The app's own Overview components, fed by the landing page's simulation.
// They flash and pulse on new data exactly as they do in the product.
export default function LiveDashboard({ dashboard }) {
  return (
    <div className="lp-dash" aria-label="TruePositive overview with sample data">
      <StatusBanner banner={dashboard.banner} />
      <div className="lp-dash-kpis">
        {dashboard.kpis.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>
      <Card title="Latest alerts">
        <AlertQueueList items={dashboard.queue} />
      </Card>
    </div>
  );
}
