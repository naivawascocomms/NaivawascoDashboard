from django.apps import AppConfig


class ProductionConfig(AppConfig):
    name = 'production'

    def ready(self):
        import production.signals  # noqa: F401
