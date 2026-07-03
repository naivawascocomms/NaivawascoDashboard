from calendar import month_name
from decimal import Decimal
from textwrap import wrap

from django.db.models import Prefetch

from .models import ProjectMonthlyUpdate, ProjectProgressItem, ProjectReport, Visibility


MANAGEMENT_VISIBILITIES = [Visibility.MANAGEMENT, Visibility.REPORT]
REPORT_VISIBILITIES = [Visibility.REPORT]


def decimal_to_float(value):
    if value is None:
        return None
    return float(value)


def build_meeting_report_payload(report):
    updates = (
        report.updates
        .filter(include_in_management=True)
        .select_related('project')
        .prefetch_related(
            'project__components',
            Prefetch(
                'progress_items',
                queryset=ProjectProgressItem.objects.filter(
                    visibility__in=MANAGEMENT_VISIBILITIES,
                ).select_related('component').order_by('display_order', 'id'),
            ),
            'kpi_values__kpi',
        )
        .order_by('report_order', 'id')
    )

    rows = []
    for index, update in enumerate(updates, start=1):
        project = update.project
        rows.append({
            'sn': index,
            'update_id': update.id,
            'project_id': project.id,
            'project_name': project.name,
            'project_code': project.project_code,
            'project_type': project.project_type,
            'funding_source': project.funding_source,
            'budget_amount': decimal_to_float(project.budget_amount),
            'main_components': [
                {
                    'id': component.id,
                    'title': component.title,
                    'description': component.description,
                    'unit': component.unit,
                    'planned_quantity': decimal_to_float(component.planned_quantity),
                }
                for component in project.components.all()
            ],
            'status_previous': update.previous_status_text,
            'status_current': update.current_status_text,
            'overall_percent_complete': decimal_to_float(update.overall_percent_complete),
            'health': update.health,
            'key_risks': update.key_risks,
            'next_actions': update.next_actions,
            'progress_items': [
                {
                    'id': item.id,
                    'component_id': item.component_id,
                    'component_title': item.component.title if item.component else '',
                    'title': item.title,
                    'description': item.description,
                    'unit': item.unit,
                    'planned_quantity': decimal_to_float(item.planned_quantity),
                    'completed_quantity': decimal_to_float(item.completed_quantity),
                    'percent_complete': decimal_to_float(item.percent_complete),
                    'status_text': item.status_text,
                }
                for item in update.progress_items.all()
            ],
            'kpis': [
                {
                    'id': value.id,
                    'code': value.kpi.code,
                    'name': value.kpi.name,
                    'unit': value.kpi.unit,
                    'target_value': decimal_to_float(value.target_value_snapshot),
                    'actual_value': decimal_to_float(value.actual_value),
                    'actual_text': value.actual_text,
                    'percent_complete': decimal_to_float(value.percent_complete),
                }
                for value in update.kpi_values.all()
            ],
        })

    return {
        'id': report.id,
        'title': report.title,
        'year': report.year,
        'month': report.month,
        'month_name': month_name[report.month],
        'department': report.department,
        'classification': report.classification,
        'previous_status_date': report.previous_status_date,
        'current_status_date': report.current_status_date,
        'status': report.status,
        'prepared_by': report.prepared_by_name,
        'prepared_at': report.prepared_at,
        'executive_summary': report.executive_summary,
        'rows': rows,
    }


def _pdf_escape(text):
    value = str(text or '')
    value = value.encode('latin-1', 'replace').decode('latin-1')
    return value.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _line_wrap(text, width=86):
    if not text:
        return ['']
    lines = []
    for raw_line in str(text).splitlines():
        if not raw_line.strip():
            lines.append('')
            continue
        lines.extend(wrap(raw_line, width=width, replace_whitespace=False) or [''])
    return lines


def _currency(value):
    if value in (None, ''):
        return ''
    if isinstance(value, Decimal):
        value = float(value)
    return f'{value:,.2f}'


def _report_lines(report):
    payload = build_meeting_report_payload(report)
    lines = [
        f'{payload["classification"]} - {payload["department"]}',
        f'{payload["title"]}: {payload["month_name"]} {payload["year"]}',
        '',
        f'Previous status date: {payload["previous_status_date"] or "N/A"}',
        f'Current status date: {payload["current_status_date"]}',
        f'Prepared by: {payload["prepared_by"] or "N/A"}',
        '',
    ]

    if payload['executive_summary']:
        lines.append('Executive Summary')
        lines.extend(_line_wrap(payload['executive_summary'], 92))
        lines.append('')

    lines.append('PROJECTS: Ongoing')
    lines.append('')

    for row in payload['rows']:
        project_title = f'{row["sn"]}. {row["project_name"]}'
        bracket_parts = []
        if row['funding_source']:
            bracket_parts.append(row['funding_source'])
        if row['budget_amount'] is not None:
            bracket_parts.append(_currency(row['budget_amount']))
        if bracket_parts:
            project_title += f' [{", ".join(bracket_parts)}]'
        lines.extend(_line_wrap(project_title, 92))
        if row['overall_percent_complete'] is not None:
            lines.append(f'Completion: {row["overall_percent_complete"]:.2f}% | Health: {row["health"]}')
        else:
            lines.append(f'Health: {row["health"]}')

        if row['main_components']:
            lines.append('Main components:')
            for component in row['main_components']:
                description = component['description'] or ''
                label = component['title']
                if component['planned_quantity'] is not None and component['unit']:
                    label = f'{label} ({component["planned_quantity"]:g} {component["unit"]})'
                lines.extend(_line_wrap(f'- {label}. {description}'.strip(), 88))

        lines.append('Previous status:')
        lines.extend(_line_wrap(row['status_previous'] or 'N/A', 88))
        lines.append('Current status:')
        lines.extend(_line_wrap(row['status_current'] or 'N/A', 88))

        visible_progress = row['progress_items']
        if visible_progress:
            lines.append('Progress KPIs:')
            for item in visible_progress:
                qty = ''
                if item['completed_quantity'] is not None and item['planned_quantity'] is not None:
                    qty = f' {item["completed_quantity"]:g}/{item["planned_quantity"]:g}{item["unit"] or ""}'
                pct = f' {item["percent_complete"]:.2f}%' if item['percent_complete'] is not None else ''
                suffix = item['status_text'] or item['description']
                lines.extend(_line_wrap(f'- {item["title"]}:{qty}{pct} {suffix}'.strip(), 88))

        if row['key_risks']:
            lines.append('Key risks:')
            lines.extend(_line_wrap(row['key_risks'], 88))
        if row['next_actions']:
            lines.append('Next actions:')
            lines.extend(_line_wrap(row['next_actions'], 88))
        lines.append('')

    lines.append('End')
    return lines


def _paginate_lines(lines, lines_per_page=60):
    pages = []
    current = []
    for line in lines:
        if len(current) >= lines_per_page:
            pages.append(current)
            current = []
        current.append(line)
    if current:
        pages.append(current)
    return pages or [[]]


def _content_stream(page_lines, page_number, page_count):
    commands = ['BT', '/F1 9 Tf', '40 800 Td']
    first = True
    for line in page_lines:
        if not first:
            commands.append('0 -12 Td')
        commands.append(f'({_pdf_escape(line)}) Tj')
        first = False
    commands.extend([
        'ET',
        'BT',
        '/F1 8 Tf',
        f'270 24 Td (Page {page_number} of {page_count}) Tj',
        'ET',
    ])
    return '\n'.join(commands).encode('latin-1', 'replace')


def render_project_report_pdf(report):
    report = (
        ProjectReport.objects
        .select_related('prepared_by')
        .prefetch_related(
            Prefetch(
                'updates',
                queryset=ProjectMonthlyUpdate.objects.select_related('project').order_by('report_order', 'id'),
            )
        )
        .get(pk=report.pk)
    )
    pages = _paginate_lines(_report_lines(report))

    objects = []
    page_object_ids = []
    next_id = 4
    for page_number, page_lines in enumerate(pages, start=1):
        content = _content_stream(page_lines, page_number, len(pages))
        content_id = next_id
        page_id = next_id + 1
        next_id += 2
        page_object_ids.append(page_id)
        objects.append((content_id, b'<< /Length ' + str(len(content)).encode('ascii') + b' >>\nstream\n' + content + b'\nendstream'))
        page = (
            f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
            f'/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>'
        ).encode('ascii')
        objects.append((page_id, page))

    pages_kids = ' '.join(f'{page_id} 0 R' for page_id in page_object_ids)
    base_objects = [
        (1, b'<< /Type /Catalog /Pages 2 0 R >>'),
        (2, f'<< /Type /Pages /Kids [{pages_kids}] /Count {len(page_object_ids)} >>'.encode('ascii')),
        (3, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    ]
    all_objects = sorted(base_objects + objects, key=lambda item: item[0])

    output = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for object_id, body in all_objects:
        offsets.append(len(output))
        output.extend(f'{object_id} 0 obj\n'.encode('ascii'))
        output.extend(body)
        output.extend(b'\nendobj\n')

    xref_offset = len(output)
    object_count = max(object_id for object_id, _body in all_objects) + 1
    output.extend(f'xref\n0 {object_count}\n'.encode('ascii'))
    output.extend(b'0000000000 65535 f \n')
    offset_map = {object_id: offset for object_id, offset in zip([item[0] for item in all_objects], offsets[1:])}
    for object_id in range(1, object_count):
        output.extend(f'{offset_map.get(object_id, 0):010d} 00000 n \n'.encode('ascii'))
    output.extend(f'trailer\n<< /Size {object_count} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n'.encode('ascii'))
    return bytes(output)
