import { Card } from "../common/Card";
import { AlertQueueList } from "./AlertQueueList";

export function AlertQueueCard({ items }) {
  return (
    <Card title="Alert queue">
      <AlertQueueList items={items} />
    </Card>
  );
}
