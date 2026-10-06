class DurabilityError(Exception):
    """The change could not be confirmed as safely stored in the bucket."""


class LeaseLostError(DurabilityError):
    pass


class LeaseUnavailableError(DurabilityError):
    pass


class ArchiveTimeoutError(DurabilityError):
    pass


class BackupFailedError(DurabilityError):
    pass
