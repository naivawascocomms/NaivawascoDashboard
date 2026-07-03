import re


STATUS_PATTERNS = [
    ('NOT_FUNCTIONAL', re.compile(r'\bnot\s+functional\b|\bnon[-\s]?functional\b', re.IGNORECASE)),
    ('NOT_REGISTERING', re.compile(r'\bnot\s+register(?:ing)?\b|\bnot\s+record(?:ing)?\b', re.IGNORECASE)),
    ('OVER_REGISTERING', re.compile(r'\bover[-\s]?register(?:ing)?\b', re.IGNORECASE)),
    ('FAULTY', re.compile(r'\bfaulty\b', re.IGNORECASE)),
    ('ESTIMATED', re.compile(r'\bestimat(?:e|ed|es)\b', re.IGNORECASE)),
]

CONDITION_CLEANUP_PATTERNS = [
    r'\bshared\s+by\s+distr(?:ibution)?\s+as\s+bulk\s+water\s+sale\b',
    r'\bshared\s+with\s+distr(?:ibution)?(?:\s*-\s*[a-z0-9\s]+zone)?\b',
    r'\bshared\s+with\s+production\b',
    r'\bmeter\s+faulty\b',
    r'\bfaulty\b',
    r'\bestimates?\s+used\b',
    r'\bnot\s+functional\b',
    r'\bnon[-\s]?functional\b',
    r'\bnot\s+register(?:ing)?\b',
    r'\bnot\s+record(?:ing)?\b',
    r'\bmeter\s+over[-\s]?register(?:ing)?\b',
    r'\bover[-\s]?register(?:ing)?\b',
]


def slugify_meter_name(name):
    value = re.sub(r'[^A-Z0-9]+', '-', str(name or '').upper()).strip('-')
    value = re.sub(r'-{2,}', '-', value)
    return value[:100] or 'WATER-METER'


def clean_meter_condition_text(name):
    value = str(name or '')
    for pattern in CONDITION_CLEANUP_PATTERNS:
        value = re.sub(pattern, '', value, flags=re.IGNORECASE)
    value = re.sub(r'\bMeter\s+Meter\b', 'Meter', value, flags=re.IGNORECASE)
    value = re.sub(r'\s+', ' ', value)
    return value.strip(' -_,;')


def split_meter_name_and_notes(raw_name):
    text = str(raw_name or '').strip()
    if not text:
        return '', []

    extracted_notes = [match.strip() for match in re.findall(r'\(([^)]*)\)', text) if match.strip()]
    clean_name = re.sub(r'\s*\([^)]*\)', '', text)
    clean_name = clean_meter_condition_text(clean_name)
    clean_name = re.sub(r'\s+', ' ', clean_name).strip(' -')
    return clean_name, extracted_notes


def build_workbook_annotation(notes):
    cleaned = [note.strip() for note in notes if note and note.strip()]
    if not cleaned:
        return ''
    if len(cleaned) == 1:
        return f'Workbook annotation: {cleaned[0]}.'
    return 'Workbook annotations: ' + '; '.join(cleaned) + '.'


def merge_notes(existing, addition):
    existing = (existing or '').strip()
    addition = (addition or '').strip()
    if not addition:
        return existing
    if not existing:
        return addition
    if addition in existing:
        return existing
    return f'{existing}\n{addition}'


def infer_meter_operational_status(*texts):
    combined = ' '.join(str(text or '') for text in texts)
    for status, pattern in STATUS_PATTERNS:
        if pattern.search(combined):
            return status
    return 'WORKING'
