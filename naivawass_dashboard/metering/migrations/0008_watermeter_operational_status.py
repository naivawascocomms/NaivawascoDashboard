from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('metering', '0007_mobile_external_ids'),
    ]

    operations = [
        migrations.AddField(
            model_name='watermeter',
            name='operational_status',
            field=models.CharField(
                choices=[
                    ('WORKING', 'Working'),
                    ('FAULTY', 'Faulty'),
                    ('OVER_REGISTERING', 'Over Registering'),
                    ('NOT_REGISTERING', 'Not Registering'),
                    ('NOT_FUNCTIONAL', 'Not Functional'),
                    ('ESTIMATED', 'Estimated Readings Used'),
                    ('UNKNOWN', 'Unknown'),
                ],
                default='WORKING',
                help_text='Inventory condition only. Balance calculations still use configured meter readings.',
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='watermeter',
            name='operational_status_notes',
            field=models.TextField(blank=True),
        ),
    ]
