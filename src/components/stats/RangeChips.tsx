import { Chip, Row } from '@/components/ui';
import { STAT_RANGE_LABELS, type StatRange } from '@/domain/stats';

export function RangeChips({
  value,
  onChange,
  ranges = ['1M', '3M', '1Y', 'ALL'],
}: {
  value: StatRange;
  onChange: (r: StatRange) => void;
  ranges?: StatRange[];
}) {
  return (
    <Row gap={2} wrap>
      {ranges.map((r) => (
        <Chip key={r} label={STAT_RANGE_LABELS[r]} selected={r === value} onPress={() => onChange(r)} />
      ))}
    </Row>
  );
}
