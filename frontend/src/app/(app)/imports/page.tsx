import { ImportsView } from './imports-view';

/**
 * Imports section. A thin server component that renders the client
 * {@link ImportsView}, a guided wizard for bringing customers in from a CSV or
 * XLSX file — upload, map columns, review, then commit. All parsing, validation
 * and duplicate detection happen on the backend (§46); the UI only guides.
 */
export default function ImportsPage(): React.JSX.Element {
  return <ImportsView />;
}
