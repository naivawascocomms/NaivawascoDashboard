from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('metering', '0005_reading_submitted_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='meterreadingassignment',
            name='approval_delegate',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='meter_reading_approval_delegations',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
