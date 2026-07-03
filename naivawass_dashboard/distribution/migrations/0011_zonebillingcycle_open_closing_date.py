from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('distribution', '0010_alter_operationalmonthlydistribution_unique_together_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='zonebillingcycle',
            name='closing_date',
            field=models.DateField(
                blank=True,
                help_text='Meter closing date for this zonal cycle. Leave blank while the cycle is active/open.',
                null=True,
            ),
        ),
    ]
