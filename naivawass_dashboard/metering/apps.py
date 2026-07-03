from django.apps import AppConfig


class MeteringConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'metering'

    def ready(self):
        import metering.signals  # noqa: F401
