import { describe, it, expect } from 'vitest';
import { classifyTreeSitterAuditRecords } from '../../scripts/tree-sitter-audit-classify.mjs';

describe('classifyTreeSitterAuditRecords', () => {
  it('classifies container-aware diagnostics and keeps compatibility tags', () => {
    const input = [
      {
        file_path: 'Assets/A.cs',
        method_count: 3,
        class_count: 0,
        interface_count: 1,
        root_has_error: false,
        error_type: 'missing_class_with_methods',
      },
      {
        file_path: 'Assets/B.cs',
        method_count: 2,
        class_count: 0,
        interface_count: 0,
        struct_count: 0,
        record_count: 0,
        delegate_count: 0,
        enum_count: 0,
        root_has_error: false,
        error_type: 'missing_class_with_methods',
      },
      {
        file_path: 'Assets/C.cs',
        method_count: 2,
        class_count: 1,
        root_has_error: true,
        error_type: 'root_has_error',
      },
      {
        file_path: 'Assets/D.cs',
        method_count: 0,
        class_count: 0,
        root_has_error: false,
        error_type: 'parse_throw',
      },
    ];

    const out = classifyTreeSitterAuditRecords(input);

    expect(out.summary.total).toBe(4);
    expect(out.summary.byType.parse_throw).toBe(1);
    expect(out.summary.byType.root_has_error).toBe(1);
    expect(out.summary.byType.missing_container_with_methods).toBe(1);
    expect(out.summary.byType.ok).toBe(1);
    expect(out.summary.compatibility.missing_class_with_methods).toBe(2);
    expect(out.summary.falsePositiveLikely).toBe(1);

    const recordA = out.records.find((record) => record.file_path === 'Assets/A.cs');
    expect(recordA?.classified_error_type).toBe('ok');
    expect(recordA?.is_false_positive_likely).toBe(true);
    expect(recordA?.compatibility_tags).toContain('missing_class_with_methods');

    const recordB = out.records.find((record) => record.file_path === 'Assets/B.cs');
    expect(recordB?.classified_error_type).toBe('missing_container_with_methods');
    expect(recordB?.is_false_positive_likely).toBe(false);
  });
});
