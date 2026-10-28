import csv


def export(rows, path):
    with open(path, "w", newline="") as f:
        csv.writer(f).writerows(rows)
