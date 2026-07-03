from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('incidents', '0002_incident_assigned_to_user'),
    ]

    operations = [
        migrations.AddField(
            model_name='incident',
            name='mobile_external_id',
            field=models.UUIDField(blank=True, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='incidentcomment',
            name='mobile_external_id',
            field=models.UUIDField(blank=True, null=True, unique=True),
        ),
    ]
