USER_ROLE_CHOICES = [
    ('PRODUCTION_SUPERVISOR', 'Production Supervisor'),
    ('PUMP_OPERATOR', 'Pump Operator'),
    ('ZONAL_OFFICER', 'Zonal Officer'),
    ('PLUMBER', 'Plumber'),
]

ASSIGNER_ROLES = {'PRODUCTION_SUPERVISOR', 'ZONAL_OFFICER'}
READER_ROLES = {'PUMP_OPERATOR', 'PLUMBER'}

READING_SCOPE_CHOICES = [
    ('PRODUCTION_SITE', 'Production Site'),
    ('ZONE', 'Zone'),
]
