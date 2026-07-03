from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('metering', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='distributionwatermeterassignment',
            name='allocation_percentage',
            field=models.DecimalField(
                decimal_places=2,
                default=100,
                help_text='Signed contribution factor when one physical meter is shared or subtracted from a zone total.',
                max_digits=5,
                validators=[
                    django.core.validators.MinValueValidator(-100),
                    django.core.validators.MaxValueValidator(100),
                ],
            ),
        ),
    ]
