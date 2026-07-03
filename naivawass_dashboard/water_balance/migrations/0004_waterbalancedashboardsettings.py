import datetime

from django.db import migrations, models


def create_default_settings(apps, schema_editor):
    Settings = apps.get_model('water_balance', 'WaterBalanceDashboardSettings')
    Settings.objects.get_or_create(
        name='default',
        defaults={
            'historical_import_end_date': datetime.date(2026, 3, 31),
            'balance_testing_start_date': datetime.date(2026, 4, 1),
            'live_balance_start_date': datetime.date(2026, 6, 1),
            'is_active': True,
            'notes': 'Default rollout: imported dashboards through March 2026, mock balance testing from April, live balance from June 2026.',
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('water_balance', '0003_waterbalancemodel_waterbalancenode_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='WaterBalanceDashboardSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='default', max_length=100, unique=True)),
                ('historical_import_end_date', models.DateField(default=datetime.date(2026, 3, 31), help_text='Periods ending on or before this date use imported dashboard figures.')),
                ('balance_testing_start_date', models.DateField(default=datetime.date(2026, 4, 1), help_text='Date from which balance-model output may be used for test/mock dashboard periods.')),
                ('live_balance_start_date', models.DateField(default=datetime.date(2026, 6, 1), help_text='Date from which balance-model output is considered live operational dashboard data.')),
                ('is_active', models.BooleanField(default=True)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Water Balance Dashboard Settings',
                'verbose_name_plural': 'Water Balance Dashboard Settings',
                'ordering': ['-is_active', 'name'],
            },
        ),
        migrations.RunPython(create_default_settings, migrations.RunPython.noop),
    ]
