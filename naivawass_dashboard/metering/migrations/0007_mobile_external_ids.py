from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('metering', '0006_meterreadingassignment_approval_delegate'),
    ]

    operations = [
        migrations.AddField(
            model_name='energymeterreading',
            name='mobile_external_id',
            field=models.UUIDField(blank=True, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='watermeterreading',
            name='mobile_external_id',
            field=models.UUIDField(blank=True, null=True, unique=True),
        ),
    ]
